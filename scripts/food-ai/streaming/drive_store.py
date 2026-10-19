"""Drive-only byte store. No download/temp/cache paths; strict owner-only ancestry."""
import hashlib
import io
import json
import os
import uuid

import requests

ROOT_ID = "1qumdyNBQbUoQWgQHcI_6BpYnzYlNB9iW"
API = "https://www.googleapis.com/drive/v3"
FIELDS = "id,name,mimeType,parents,trashed,size,version,permissions(type,role)"
LAYOUT = {
    "app_inbox": "01_app_feedback/inbox",
    "app_train": "01_app_feedback/verified_train",
    "app_eval": "01_app_feedback/verified_eval",
    "base": "02_public_licensed/base_train",
    "auto_inbox": "02_public_licensed/autonomous_inbox",
    "auto_train": "02_public_licensed/autonomous_train",
    "products": "02_public_licensed/product_references",
    "public_eval": "02_public_licensed/eval",
    "nutrition": "03_nutrition5k",
    "cache": "04_clip_embeddings_cache",
    "assets": "04_clip_embeddings_cache/model_assets",
    "candidates": "05_models_and_reports/candidate_test_model",
    "logs": "05_models_and_reports/training_logs",
}
MAX_BLOB = 384 * 1024 * 1024


class MissingDriveFolder(RuntimeError):
    """Authenticated, private parent exists but the requested layout is not initialized."""


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def private(meta, parent=None):
    permissions = meta.get("permissions", [])
    if meta.get("trashed") is not False or not permissions or any(
        p.get("role") != "owner" or p.get("type") != "user" for p in permissions
    ):
        raise ValueError("Drive item is not verified owner-only")
    if parent is not None and meta.get("parents") != [parent]:
        raise ValueError("Drive item is outside the expected parent")
    return meta


class DriveStore:
    def __init__(self, session=None):
        if session is None:
            import google.auth
            from google.auth.transport.requests import AuthorizedSession
            # Reads existing credentials only. No gcloud login or credential persistence here.
            credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/drive"])
            session = AuthorizedSession(credentials)
        self.session = session

    def request(self, method, path, **kwargs):
        response = self.session.request(method, API + path, timeout=(15, 120), **kwargs)
        if not response.ok:
            # Provider error bodies might contain account information. Never log them.
            raise RuntimeError(f"Drive HTTP {response.status_code}")
        return response

    def meta(self, file_id):
        return self.request("GET", f"/files/{file_id}", params={"fields": FIELDS}).json()

    def guard(self, file_id):
        current, seen = file_id, set()
        first = None
        for _ in range(12):
            if current in seen:
                break
            seen.add(current)
            meta = private(self.meta(current))
            first = first or meta
            if current == ROOT_ID:
                return first
            parents = meta.get("parents", [])
            if len(parents) != 1:
                break
            current = parents[0]
        raise ValueError("Drive ancestry does not reach foodDB")

    def children(self, parent, name=None):
        self.guard(parent)
        query = f"'{parent}' in parents and trashed = false"
        if name is not None:
            escaped = name.replace("\\", "\\\\").replace("'", "\\'")
            query += f" and name = '{escaped}'"
        page, result = None, []
        while True:
            value = self.request("GET", "/files", params={
                "q": query, "fields": "files(" + FIELDS + "),nextPageToken,incompleteSearch",
                "pageSize": 1000, **({"pageToken": page} if page else {}),
            }).json()
            if value.get("incompleteSearch"):
                raise RuntimeError("Incomplete Drive listing")
            result.extend(private(f, parent) for f in value["files"])
            page = value.get("nextPageToken")
            if not page:
                return result

    def find(self, parent, name):
        files = self.children(parent, name)
        if len(files) > 1:
            raise ValueError("Duplicate Drive names require owner review")
        return files[0] if files else None

    def layout(self, create=False):
        self.guard(ROOT_ID)
        paths, result = {"": ROOT_ID}, {}
        for key, path in LAYOUT.items():
            prefix = ""
            for segment in path.split("/"):
                parent = paths[prefix]
                prefix = (prefix + "/" + segment).strip("/")
                if prefix in paths:
                    continue
                found = self.find(parent, segment)
                if not found:
                    if not create:
                        raise MissingDriveFolder(f"Drive folder missing: {prefix}")
                    found = self.request("POST", "/files", json={
                        "name": segment, "mimeType": "application/vnd.google-apps.folder", "parents": [parent],
                    }, params={"fields": FIELDS}).json()
                if found["mimeType"] != "application/vnd.google-apps.folder":
                    raise ValueError("Expected a Drive folder")
                private(found, parent)
                paths[prefix] = found["id"]
            result[key] = paths[path]
        return result

    def read(self, file_id, limit=MAX_BLOB):
        meta = self.guard(file_id)
        if int(meta.get("size", limit + 1)) > limit:
            raise ValueError("RAM byte limit exceeded")
        with self.request("GET", f"/files/{file_id}", params={"alt": "media"}, stream=True) as response:
            output = io.BytesIO()
            for chunk in response.iter_content(1024 * 1024):
                if output.tell() + len(chunk) > limit:
                    raise ValueError("RAM byte limit exceeded")
                output.write(chunk)
            data = output.getvalue()
        if len(data) != int(meta["size"]):
            raise ValueError("Incomplete Drive download")
        return data

    def json(self, parent, name, default=None):
        found = self.find(parent, name)
        return json.loads(self.read(found["id"], 32 * 1024 * 1024)) if found else default

    def capacity(self, additional):
        quota = self.request("GET", "/about", params={"fields": "storageQuota"}).json()["storageQuota"]
        if "limit" not in quota or int(quota["limit"]) - int(quota["usage"]) < additional:
            raise RuntimeError("Drive free capacity unavailable or insufficient")
        # Deliberately stricter than the user's 5 TB account capacity. Do not buy storage.
        if int(quota["usage"]) + additional > 4_000_000_000_000:
            raise RuntimeError("Conservative 4 TB storage ceiling reached")

    def put(self, parent, name, data, mime="application/octet-stream", replace=False):
        if len(data) > MAX_BLOB:
            raise ValueError("RAM byte limit exceeded")
        self.guard(parent)
        existing = self.find(parent, name)
        if existing:
            if sha(self.read(existing["id"])) == sha(data):
                return existing["id"]
            if not replace:
                raise ValueError("Existing file has different contents; not overwritten")
        self.capacity(len(data))
        metadata = {"name": name, "mimeType": mime}
        if not existing:
            metadata["parents"] = [parent]
        # Resumable upload: metadata and bytes are separate; no local staging or multipart copy.
        target = "/files/" + existing["id"] if existing else "/files"
        response = self.session.request("PATCH" if existing else "POST",
            "https://www.googleapis.com/upload/drive/v3" + target,
            params={"uploadType": "resumable", "fields": FIELDS}, json=metadata,
            headers={"X-Upload-Content-Type": mime, "X-Upload-Content-Length": str(len(data))}, timeout=60)
        if not response.ok:
            raise RuntimeError(f"Drive upload initialization HTTP {response.status_code}")
        location = response.headers["Location"]
        if not location.startswith("https://www.googleapis.com/"):
            raise RuntimeError("Unexpected upload host")
        response = self.session.put(location, data=data, headers={"Content-Type": mime}, timeout=(15, 180))
        if not response.ok:
            raise RuntimeError(f"Drive upload HTTP {response.status_code}")
        saved = private(response.json(), parent)
        # Full fresh download, never a local-copy checksum masquerading as verification.
        if sha(self.read(saved["id"])) != sha(data):
            raise RuntimeError("Drive readback SHA-256 mismatch")
        return saved["id"]

    def put_json(self, parent, name, value, replace=False):
        return self.put(parent, name, encoded(value), "application/json", replace)
