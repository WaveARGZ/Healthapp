import base64
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from drive_store import MAX_BLOB
from hybrid import CONTRACT


class Features:
    """Persistent CLIP process with an authenticated RAM-to-Drive cache bridge."""
    def __init__(self, drive, folder):
        self.drive, self.folder, self.failure = drive, folder, None
        self.token = secrets.token_urlsafe(32)
        self.mutex = threading.Lock()
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def service(self, write=False):
                try:
                    if self.headers.get("X-BodyMake-Bridge") != owner.token or not re.fullmatch(r"/cache/[a-f0-9]{64}", self.path):
                        self.send_error(403)
                        return
                    name = self.path.rsplit("/", 1)[-1] + ".bin"
                    with owner.mutex:
                        if write:
                            length = int(self.headers.get("Content-Length", "-1"))
                            if not 0 <= length <= MAX_BLOB:
                                raise ValueError("Model asset RAM limit exceeded")
                            data = self.rfile.read(length)
                            if len(data) != length:
                                raise ValueError("Truncated model asset")
                            owner.drive.put(owner.folder, name, data)
                            data = b"ok"
                        else:
                            file = owner.drive.find(owner.folder, name)
                            if not file:
                                self.send_error(404)
                                return
                            data = owner.drive.read(file["id"])
                    self.send_response(200)
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except Exception:
                    owner.failure = "Drive model cache could not be verified"
                    self.send_error(502)

            def do_GET(self):
                self.service()

            def do_PUT(self):
                self.service(True)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.process = subprocess.Popen(["node", "--max-old-space-size=1536", str(Path(__file__).with_name("feature-worker.mjs"))],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
            env={**os.environ, "OMP_NUM_THREADS": "1", "TOKENIZERS_PARALLELISM": "false"})
        try:
            output = self.call({"op": "init", "cacheUrl": f"http://127.0.0.1:{self.server.server_port}", "cacheToken": self.token}, timeout=900)
            if output.get("contract") != CONTRACT:
                raise ValueError("CLIP contract mismatch")
        except BaseException:
            self.close()
            raise

    def call(self, value, timeout=180):
        self.process.stdin.write(json.dumps(value) + "\n")
        self.process.stdin.flush()
        # Native library diagnostics are not training output; skip non-protocol lines.
        import time
        deadline = time.monotonic() + timeout
        with selectors.DefaultSelector() as selector:
            selector.register(self.process.stdout, selectors.EVENT_READ)
            while time.monotonic() < deadline:
                if not selector.select(max(0, deadline - time.monotonic())):
                    break
                line = self.process.stdout.readline()
                if not line:
                    raise RuntimeError("CLIP worker exited")
                try:
                    result = json.loads(line)
                except ValueError:
                    continue
                if self.failure or result.get("ok") is not True:
                    raise RuntimeError(self.failure or "CLIP feature extraction failed")
                return result
        raise TimeoutError("CLIP worker exceeded time limit")

    def extract(self, image, labels):
        return self.call({"op": "extract", "image": base64.b64encode(image).decode(), "labels": labels})

    def close(self):
        if getattr(self, "process", None):
            self.process.stdin.close()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.terminate()
                self.process.wait(timeout=10)
        self.server.shutdown()
        self.server.server_close()
