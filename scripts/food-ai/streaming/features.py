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
    def __init__(self, drive, folder, progress=None):
        self.drive, self.folder, self.failure = drive, folder, None
        self.progress = progress or (lambda detail: None)
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
                            owner.progress(f"CLIP資材をDriveへ保存・完全再取得照合中（{length:,} bytes）")
                            owner.drive.put(owner.folder, name, data)
                            data = b"ok"
                        else:
                            owner.progress("CLIP資材のDrive保存状態を確認中")
                            file = owner.drive.find(owner.folder, name)
                            if not file:
                                self.send_error(404)
                                return
                            owner.progress(f"CLIP資材をDriveからRAMへ読み込み中（{int(file.get('size', 0)):,} bytes）")
                            data = owner.drive.read(file["id"])
                    self.send_response(200)
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except Exception as error:
                    # Keep the exception in RAM for the caller's fixed-code classifier;
                    # do not send the provider body or credentials through the bridge.
                    owner.failure = error
                    self.send_error(502)

            def do_GET(self):
                self.service()

            def do_PUT(self):
                self.service(True)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self._stdout_buffer = b""
        self.process = subprocess.Popen(["node", "--max-old-space-size=1536", str(Path(__file__).with_name("feature-worker.mjs"))],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env={**os.environ, "OMP_NUM_THREADS": "1", "TOKENIZERS_PARALLELISM": "false"})
        try:
            output = self.call({"op": "init", "cacheUrl": f"http://127.0.0.1:{self.server.server_port}", "cacheToken": self.token}, timeout=900)
            if output.get("contract") != CONTRACT:
                raise ValueError("CLIP contract mismatch")
        except BaseException:
            self.close()
            raise

    def call(self, value, timeout=180):
        self.process.stdin.write((json.dumps(value) + "\n").encode())
        self.process.stdin.flush()
        # Read the descriptor directly, keeping partial/multiple lines in RAM.
        # TextIOWrapper.readline can prefetch a JSON reply after a warning;
        # selecting that descriptor again then waits despite the buffered reply.
        import time
        deadline = time.monotonic() + timeout
        with selectors.DefaultSelector() as selector:
            selector.register(self.process.stdout, selectors.EVENT_READ)
            while time.monotonic() < deadline:
                while b"\n" in self._stdout_buffer:
                    line, self._stdout_buffer = self._stdout_buffer.split(b"\n", 1)
                    try:
                        result = json.loads(line)
                    except ValueError:
                        continue
                    # Native diagnostics are not protocol replies, even when
                    # they happen to contain valid JSON scalars or arrays.
                    if not isinstance(result, dict) or "ok" not in result:
                        continue
                    if self.failure:
                        raise self.failure
                    if result.get("ok") is not True:
                        code = result.get("error", "feature_worker_failed")
                        safe_codes = {"model_asset_missing", "model_download_failed", "model_cache_failed", "model_contract_mismatch", "model_initialization_failed", "image_feature_failed"}
                        raise RuntimeError("CLIP " + code if code in safe_codes else "CLIP feature extraction failed")
                    return result
                if not selector.select(max(0, deadline - time.monotonic())):
                    break
                chunk = os.read(self.process.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError("CLIP worker exited")
                self._stdout_buffer += chunk
                if len(self._stdout_buffer) > 4 * 1024 * 1024:
                    raise RuntimeError("CLIP worker protocol exceeded RAM limit")
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
