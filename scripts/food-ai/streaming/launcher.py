"""Local-only manual launcher. No disk locks, logs, data cache or autostart training."""
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import threading
from datetime import datetime, timezone
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
from drive_store import DriveStore, encoded, sha
from hybrid import model_revoked

HERE = Path(__file__).resolve().parent
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()
STATE = {"stage": "idle", "detail": "開始ボタンを押すまで学習しません。", "processed": 0}
PROCESS = None
MODEL = None
REVIEW = None
TEST_ORIGINS = {"http://localhost:3001", "http://127.0.0.1:3001"}
UI_ORIGINS = {"http://localhost:3002", "http://127.0.0.1:3002"}


def refresh_model():
    global MODEL
    MODEL = None
    drive = DriveStore()
    folders = drive.layout()
    model = drive.json(folders["candidates"], "active-test.json")
    revocations = drive.json(folders["logs"], "revocations.json", {"ids": [], "imageSha256": []})
    if model and model.get("gatePassed") is True and not model_revoked(model, revocations):
        MODEL = model
    else:
        MODEL = None


def watch(process):
    global STATE, MODEL
    for line in process.stdout:
        try:
            status = json.loads(line)
        except ValueError:
            continue
        with LOCK:
            STATE = status
    code = process.wait()
    if code and STATE.get("stage") != "blocked":
        STATE = {"stage": "blocked", "detail": "処理が停止しました。データの保存確認前に採用はしません。"}
    if code == 0:
        try:
            refresh_model()
        except Exception:
            MODEL = None


def next_review():
    global REVIEW
    drive = DriveStore()
    folders = drive.layout()
    revocations = drive.json(folders["logs"], "revocations.json", {"ids": [], "imageSha256": []})
    for kind in ("app_inbox", "auto_inbox"):
        for file in drive.children(folders[kind]):
            if not file["name"].endswith(".json"):
                continue
            record = json.loads(drive.read(file["id"], 2_500_000))
            if record.get("review", {}).get("decision") in {"accepted", "rejected"} or record.get("revoked"):
                continue
            if record.get("id") in revocations.get("ids", []) or record.get("imageSha256") in revocations.get("imageSha256", []):
                continue
            if kind == "app_inbox" and record.get("consent", {}).get("granted") is not True:
                continue
            raw = drive.read(record["imageFileId"], 5_000_000)
            if sha(raw) != record["imageSha256"]:
                raise ValueError("Review image hash mismatch")
            REVIEW = (folders[kind], file, record)
            catalog = json.loads((HERE.parents[2] / "lib/food-ai/test-photo-labels.json").read_text())
            names = {food["id"]: food["name"] for food in json.loads((HERE.parents[2] / "lib/data/food-library.json").read_text())["foods"]}
            return {"id": record["id"], "hash": record["imageSha256"], "image": base64.b64encode(raw).decode(),
                "labels": [[key, names.get(key, key)] for key, _ in catalog]}
    REVIEW = None
    return {"empty": True}


def save_review(options):
    if REVIEW is None or (PROCESS and PROCESS.poll() is None):
        raise ValueError("Review unavailable while training")
    folder, file, original = REVIEW
    if options.get("id") != original["id"] or options.get("hash") != original["imageSha256"]:
        raise ValueError("Stale review")
    drive = DriveStore()
    record = json.loads(drive.read(file["id"], 2_500_000))
    if record != original or sha(drive.read(record["imageFileId"], 5_000_000)) != record["imageSha256"]:
        raise ValueError("Image/record changed during review")
    labels = dict(json.loads((HERE.parents[2] / "lib/food-ai/test-photo-labels.json").read_text()))
    label, decision = options.get("foodId"), options.get("decision")
    if decision not in {"accepted", "rejected"} or (decision == "accepted" and label not in labels):
        raise ValueError("Invalid review choice")
    if decision == "accepted":
        record.setdefault("submittedFoodId", record["confirmedFoodId"])
        record["confirmedFoodId"] = label
        if record["source"].startswith("app_"):
            record["source"] = "app_user_confirmed" if (record.get("predictedFoodIds") or [None])[0] == label else "app_user_corrected"
    record["review"] = {"decision": decision, "method": "human", "reviewer": "Local owner visual review",
        "reviewedAt": datetime.now(timezone.utc).isoformat(), "imageSha256": record["imageSha256"], "foodId": label,
        "confidence": 1.0, "notes": "Owner explicitly inspected the image in the local review UI."}
    drive.put_json(folder, file["name"], record, replace=True)


def launch(options):
    global PROCESS, STATE
    with LOCK:
        if PROCESS and PROCESS.poll() is None:
            return False
        args = [sys.executable, "-B", str(HERE / "pipeline.py")]
        if options.get("preflight"):
            args.append("--preflight")
        else:
            if options.get("collect") is True:
                args.append("--collect")
            if options.get("importExisting") is True:
                args.append("--import-existing")
        PROCESS = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1"})
        STATE = {"stage": "starting", "detail": "Driveの認証・非公開状態を確認中", "processed": 0}
        threading.Thread(target=watch, args=(PROCESS,), daemon=True).start()
        return True


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def trusted_host(self):
        return self.headers.get("Host") in {"localhost:3002", "127.0.0.1:3002"}

    def send_bytes(self, data, content_type="application/json", status=200, cors=False):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        if cors and self.headers.get("Origin") in TEST_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.trusted_host():
            return self.send_bytes(b"{}", status=403)
        if self.path == "/":
            return self.send_bytes((HERE / "launcher.html").read_text().replace("__TOKEN__", TOKEN).encode(), "text/html;charset=utf-8")
        if self.path == "/test-model":
            # No private photos/labels/review metadata are exposed here, only the passing head.
            if self.headers.get("Origin") not in TEST_ORIGINS:
                return self.send_bytes(b"{}", status=403)
            try:
                refresh_model()  # Fail closed on newly revoked consent or unavailable Drive.
            except Exception:
                return self.send_bytes(b"{}", status=503, cors=True)
            public_model = {k: v for k, v in (MODEL or {}).items() if k in {"schemaVersion", "status", "contract", "labelIds", "clipLabels", "weights", "biases"}}
            return self.send_bytes(encoded(public_model), status=200 if MODEL else 404, cors=True)
        if self.path == "/status" and secrets.compare_digest(self.headers.get("X-BodyMake-Session", ""), TOKEN):
            return self.send_bytes(encoded({**STATE, "running": bool(PROCESS and PROCESS.poll() is None), "testModelAvailable": MODEL is not None}))
        if self.path == "/review" and secrets.compare_digest(self.headers.get("X-BodyMake-Session", ""), TOKEN):
            try:
                if PROCESS and PROCESS.poll() is None:
                    return self.send_bytes(b"{}", status=409)
                return self.send_bytes(encoded(next_review()))
            except Exception:
                return self.send_bytes(encoded({"error": "Drive認証・保存済み写真の対応を確認できませんでした。"}), status=502)
        self.send_bytes(b"{}", status=404)

    def do_POST(self):
        global STATE, MODEL
        if not self.trusted_host() or self.headers.get("Origin") not in UI_ORIGINS or not secrets.compare_digest(self.headers.get("X-BodyMake-Session", ""), TOKEN):
            return self.send_bytes(b"{}", status=403)
        try:
            size = int(self.headers.get("Content-Length", "-1"))
            if not 0 <= size <= 2048:
                raise ValueError()
            options = json.loads(self.rfile.read(size))
            if self.path == "/start":
                MODEL = None  # Do not keep a model with stale consent status during a new run.
                started = launch(options)
                return self.send_bytes(encoded({"ok": started}), status=200 if started else 409)
            if self.path == "/stop":
                with LOCK:
                    if PROCESS and PROCESS.poll() is None:
                        PROCESS.send_signal(signal.SIGTERM)
                        STATE = {**STATE, "stage": "stopping", "detail": "安全停止を要求しました。現在の通信・キャッシュ保存完了を待っています。"}
                return self.send_bytes(b'{"ok":true}')
            if self.path == "/review":
                save_review(options)
                return self.send_bytes(b'{"ok":true}')
        except (ValueError, TypeError):
            return self.send_bytes(b"{}", status=400)
        except Exception:
            return self.send_bytes(b"{}", status=502)
        self.send_bytes(b"{}", status=404)


if __name__ == "__main__":
    # Binding one port also prevents overlapping launchers; no filesystem lock file.
    server = ThreadingHTTPServer(("127.0.0.1", 3002), Handler)
    print("BodyMake学習管理: http://127.0.0.1:3002/ （学習はまだ開始していません）", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        if PROCESS and PROCESS.poll() is None:
            PROCESS.send_signal(signal.SIGTERM)
            print("安全停止とDrive保存の完了を待っています…", flush=True)
            PROCESS.wait()
    finally:
        server.server_close()
