"""Independent review in RAM. Private Drive is the only output destination."""
import argparse
import base64
import copy
from contextlib import contextmanager
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import socket
import sys

from PIL import Image, ImageOps

from drive_store import DriveStore, private, sha
from hybrid import validate_record

REPO = Path(__file__).resolve().parents[3]
MAX_RECORD_BYTES = 2_500_000
MAX_IMAGE_BYTES = 5_000_000
ACTORS = {
    "human": ("human", "Local owner visual review"),
    "codex": ("visual-agent", "Codex"),
}


def owner_exclusions():
    # Never authenticate or create empty history in a source-only checkout.
    from pipeline import require_owner_learning_state, local_json
    require_owner_learning_state()
    return local_json("ml/artifacts/verified-exclusions.json")["exclusions"]


@contextmanager
def review_lock():
    exclusions = owner_exclusions()
    with socket.socket() as lock:
        lock.bind(("127.0.0.1", 3003))  # Same bind-only mutex as pipeline.py.
        yield exclusions


def catalog():
    labels = dict(json.loads((REPO / "lib/food-ai/test-photo-labels.json").read_text()))
    names = {food["id"]: food["name"] for food in json.loads((REPO / "lib/data/food-library.json").read_text())["foods"]}
    return labels, names


def app_training_consent(record):
    consent = record.get("consent")
    if not isinstance(consent, dict) or consent.get("granted") is not True or consent.get("version") != "food-photo-training-v2" or consent.get("purpose") != "food-recognition":
        return False
    try:
        return datetime.fromisoformat(consent["at"].replace("Z", "+00:00")).utcoffset() is not None
    except (KeyError, TypeError, AttributeError, ValueError):
        return False


def available(record, kind, revocations, exclusions):
    if not isinstance(record, dict) or not isinstance(record.get("review"), dict):
        return False
    if record["review"].get("decision") in {"accepted", "rejected"} or record.get("revoked"):
        return False
    if record.get("id") in revocations.get("ids", []) or record.get("imageSha256") in revocations.get("imageSha256", []):
        return False
    if any(row["id"] == record.get("id") or row.get("imageSha256") == record.get("imageSha256") for row in exclusions):
        return False
    if kind == "app_inbox":
        return record.get("source") in {"app_user_confirmed", "app_user_corrected"} and app_training_consent(record)
    return kind == "auto_inbox" and record.get("source") == "autonomous_public"


def revoked(drive, folders):
    result = drive.json(folders["logs"], "revocations.json", {"ids": [], "imageSha256": []})
    if not isinstance(result, dict) or not all(isinstance(result.get(key, []), list) for key in ("ids", "imageSha256")):
        raise ValueError("Invalid revocation history")
    return result


def read_input(drive, folder, file_id):
    meta = private(drive.meta(file_id), folder)
    if not meta["name"].endswith(".json") or not meta.get("version"):
        raise ValueError("Invalid review record metadata")
    raw = drive.read(file_id, MAX_RECORD_BYTES)
    record = json.loads(raw)
    # A metadata version change during the complete read invalidates the ticket.
    if private(drive.meta(file_id), folder).get("version") != meta["version"]:
        raise ValueError("Review record changed")
    return meta, raw, record


def read_image(drive, folder, record, version=None):
    meta = private(drive.meta(record["imageFileId"]), folder)
    if not meta.get("version") or version is not None and meta["version"] != version:
        raise ValueError("Review image changed")
    raw = drive.read(meta["id"], MAX_IMAGE_BYTES)
    if sha(raw) != record["imageSha256"] or private(drive.meta(meta["id"]), folder).get("version") != meta["version"]:
        raise ValueError("Review image hash/version mismatch")
    return meta, raw


def open_next_review(drive=None):
    with review_lock() as exclusions:
        drive = drive or DriveStore()
        folders = drive.layout(create=False)
        revocations = revoked(drive, folders)
        labels, names = catalog()
        outside_catalog = 0
        for kind in ("app_inbox", "auto_inbox"):
            folder = folders[kind]
            for file in drive.children(folder):
                if not file["name"].endswith(".json"):
                    continue
                meta, raw, record = read_input(drive, folder, file["id"])
                if not available(record, kind, revocations, exclusions):
                    continue
                if kind == "app_inbox" and record.get("confirmedFoodId") not in labels:
                    outside_catalog += 1
                    continue  # Preserve custom dishes as pending; never force a class.
                if not available(record, kind, revoked(drive, folders), exclusions):
                    continue
                image_meta, image = read_image(drive, folder, record)
                with Image.open(io.BytesIO(image)) as original:
                    if min(original.size) < 64 or original.width * original.height > 20_000_000:
                        raise ValueError("Review image dimensions outside safety limits")
                    preview = ImageOps.exif_transpose(original).convert("RGB")
                    preview.thumbnail((640, 640))
                    output = io.BytesIO()
                    preview.save(output, "JPEG", quality=80)
                ticket = {"recordFileId": meta["id"], "recordName": meta["name"], "recordVersion": meta["version"],
                    "recordSha256": sha(raw), "kind": kind, "id": record["id"], "hash": record["imageSha256"],
                    "imageVersion": image_meta["version"]}
                # Keep the submitted label and AI guess hidden for independent inspection.
                return {"id": record["id"], "hash": record["imageSha256"], "image": base64.b64encode(output.getvalue()).decode(),
                    "labels": [[key, names.get(key, key)] for key in labels]}, ticket
        return {"empty": True, "outsideCatalogPending": outside_catalog}, None


def commit_review(ticket, options, *, actor, drive=None):
    if actor not in ACTORS or not isinstance(ticket, dict):
        raise ValueError("Invalid reviewer or ticket")
    decision, label = options.get("decision"), options.get("foodId")
    notes = options.get("notes", "")
    if decision not in {"accepted", "rejected"} or not isinstance(label, str) or not isinstance(notes, str) or len(notes) > 2000 or actor == "codex" and not notes.strip():
        raise ValueError("Invalid independent review decision")
    if options.get("id") != ticket.get("id") or options.get("hash") != ticket.get("hash"):
        raise ValueError("Stale review")
    with review_lock() as exclusions:
        drive = drive or DriveStore()
        folders = drive.layout(create=False)
        kind = ticket.get("kind")
        if kind not in {"app_inbox", "auto_inbox"}:
            raise ValueError("Invalid review source folder")
        folder = folders[kind]

        def current_input():
            meta, raw, record = read_input(drive, folder, ticket["recordFileId"])
            if meta["name"] != ticket["recordName"] or meta["version"] != ticket["recordVersion"] or sha(raw) != ticket["recordSha256"]:
                raise ValueError("Review record changed")
            if record.get("id") != ticket["id"] or record.get("imageSha256") != ticket["hash"] or not available(record, kind, revoked(drive, folders), exclusions):
                raise ValueError("Review revoked, excluded or no longer pending")
            if drive.find(folder, meta["name"])["id"] != meta["id"]:
                raise ValueError("Review record identity mismatch")
            read_image(drive, folder, record, ticket["imageVersion"])
            return meta, raw, record

        meta, raw, record = current_input()
        labels, names = catalog()
        updated = copy.deepcopy(record)
        if decision == "accepted":
            if label not in labels:
                raise ValueError("Review label outside the supported catalog")
            if kind == "app_inbox" and record.get("confirmedFoodId") != label:
                raise ValueError("Keep submitted app label pending; do not force a different class")
            if kind == "auto_inbox":
                updated.setdefault("submittedFoodId", record.get("confirmedFoodId"))
                if "confirmedFoodName" in record:
                    updated.setdefault("submittedFoodName", record["confirmedFoodName"])
                updated["confirmedFoodId"], updated["confirmedFoodName"] = label, names.get(label, label)
        history = updated.setdefault("reviewHistory", [])
        if not isinstance(history, list):
            raise ValueError("Invalid review history; preserve for investigation")
        history.append(copy.deepcopy(record["review"]))
        method, reviewer = ACTORS[actor]
        updated["review"] = {"decision": decision, "method": method, "reviewer": reviewer,
            "reviewedAt": datetime.now(timezone.utc).isoformat(), "imageSha256": record["imageSha256"], "foodId": label,
            "notes": notes.strip() or "Owner inspected the image in the local review UI.",
            "inputRecordSha256": sha(raw), "inputRecordVersion": meta["version"]}
        if decision == "accepted":
            validate_record(updated, labels)  # Consent, commercial rights and schema gates stay intact.
        snapshot_id = drive.put(folders["logs"], f"review-input-{meta['id']}-{sha(raw)}.json", raw, "application/json")
        updated["review"]["inputSnapshotFileId"] = snapshot_id
        # Snapshot readback is completed by DriveStore.put before this fresh check.
        current_input()
        saved_id = drive.put_json(folder, meta["name"], updated, replace=True)
        if saved_id != meta["id"]:
            raise ValueError("Saved review identity mismatch")
        return {"recordFileId": saved_id, "decision": decision, "method": method, "trainingPerformed": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("next", "review"))
    options = parser.parse_args()
    try:
        if options.command == "next":
            result, ticket = open_next_review()
            result["ticket"] = ticket
        else:
            raw = sys.stdin.buffer.read(16_385)
            if len(raw) > 16_384:
                raise ValueError("Review input exceeds RAM limit")
            decision = json.loads(raw)
            # Actor is fixed by this entrypoint, never supplied by untrusted JSON.
            result = commit_review(decision.get("ticket"), decision, actor="codex")
        print(json.dumps(result, ensure_ascii=False), flush=True)
    except Exception as error:
        from pipeline import failure_status
        print(json.dumps(failure_status(error), ensure_ascii=False), flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
