"""Read legacy evidence and archived JPEGs without copying or extracting files."""
import io
import json
import re
import tarfile
from pathlib import PurePosixPath

from drive_store import sha
from hybrid import validate_record

ARCHIVE_FOLDER = "1-43fJG6gRjTVX0FPSi4_-sfRsSmP-hJT"
MAX_ARCHIVE_BYTES = 100_000_000


def source_index(sources):
    if not isinstance(sources, list):
        raise ValueError("Legacy source ledger must be a list")
    result = {}
    for source in sources:
        key = source.get("id")
        if key in result and result[key] != source:
            raise ValueError("Conflicting legacy attribution records")
        result[key] = source
    return result


def reviewed_legacy_record(original, sources, labels):
    """Map the old explicit reviewed-label contract; never derive truth from a guess."""
    if original.get("schemaVersion") != 1 or original.get("labelVerified") is not True:
        return None
    review = original.get("review", {})
    if review.get("decision") != "accepted" or review.get("method") not in {"human", "visual-agent"}:
        return None
    source = original.get("source") or sources.get(original.get("id"))
    if not isinstance(source, dict):
        return None
    if source.get("id") != original.get("id") or source.get("sha256") != review.get("imageSha256"):
        raise ValueError("Legacy source and reviewed image hash differ")
    # Older review JSON put the accepted label only in confirmedFoodId. Preserve the
    # original review verbatim alongside this adapter, including its hash/date/name.
    adapted_review = dict(review)
    if "foodId" not in adapted_review:
        adapted_review["foodId"] = original.get("confirmedFoodId")
    record = {"schemaVersion": 2, "id": original.get("id"), "source": "public_base",
        "confirmedFoodId": original.get("confirmedFoodId"), "imageSha256": review.get("imageSha256"),
        "review": adapted_review, "legacyReview": review,
        "provenance": {"pageUrl": source.get("filePage"), "license": source.get("license", "").upper(),
            "licenseUrl": source.get("licenseUrl"), "attribution": source.get("author"), "originalSource": source}}
    try:
        return validate_record(record, labels)
    except ValueError:
        return None  # Unknown labels/licenses and incomplete reviews still require review.


def archive_index(state):
    """Only previously received archives; verify the remote bytes again before use."""
    result = {}
    batches = state.get("batches", [])
    batches = batches.values() if isinstance(batches, dict) else batches
    for batch in sorted(batches, key=lambda item: item.get("createdAt", "")):
        if batch.get("dataset") != "commons" or batch.get("status") != "uploaded":
            continue
        receipt = batch.get("receipt", {})
        verification = receipt.get("downloadVerification", {})
        if receipt.get("folderId") != ARCHIVE_FOLDER or verification.get("sha256") != batch.get("sha256") or verification.get("bytes") != batch.get("bytes"):
            raise ValueError("Legacy archive receipt is incomplete")
        if not re.fullmatch(r"[a-f0-9]{64}", batch.get("sha256", "")) or not 0 < batch.get("bytes", 0) <= MAX_ARCHIVE_BYTES or not receipt.get("remoteId"):
            raise ValueError("Legacy archive receipt is invalid")
        for member in batch.get("files", []):
            key = member.get("key", "")
            if not re.fullmatch(r"commons/(images|records|attribution)/commons-[0-9]+\.(jpg|json)", key):
                continue
            reference = {"fileId": receipt["remoteId"], "archiveSha256": batch["sha256"],
                "archiveBytes": batch["bytes"], "key": key, "member": "objects/" + member.get("sha256", ""),
                "sha256": member.get("sha256"), "bytes": member.get("bytes")}
            result.setdefault(key, {})[member.get("sha256")] = reference
    return result


def archived_records(repo, state, labels, exclusions, existing_records=()):
    """Build immutable references from existing metadata; no Drive or local writes."""
    folder = repo / "training-data/commons"
    manifest = folder / "sources.json"
    sources = source_index(json.loads(manifest.read_text())) if manifest.is_file() else {}
    index = archive_index(state)
    rows = []
    for path in sorted(folder.glob("commons-*.json")):
        if path.is_symlink():
            continue
        raw_record = path.read_bytes()
        original = json.loads(raw_record)
        record = reviewed_legacy_record(original, sources, labels)
        if not record or (record["id"], record["imageSha256"], record["confirmedFoodId"]) in existing_records:
            continue
        if record["id"] in exclusions:
            if exclusions[record["id"]]["imageSha256"] != record["imageSha256"]:
                raise ValueError("Historical exclusion hash mismatch")
            continue
        image = index.get("commons/images/" + record["id"] + ".jpg", {}).get(record["imageSha256"])
        metadata = index.get("commons/records/" + record["id"] + ".json", {}).get(sha(raw_record))
        attributions = index.get("commons/attribution/" + record["id"] + ".json", {})
        attribution = list(attributions.values())[-1] if attributions else None
        if not image or not metadata or not attribution:
            continue  # A local copy is never substituted for a missing remote receipt.
        rows.append({**record, "imageFileId": image["fileId"], "recordFileId": metadata["fileId"],
            "recordVersion": metadata["sha256"], "imageArchive": image, "recordArchive": metadata,
            "sourceArchive": attribution,
            "sourceFolderId": ARCHIVE_FOLDER})
    return rows


class ArchiveReader:
    """One bounded tar in RAM; extractfile reads a member into RAM, never a path."""
    def __init__(self, drive):
        self.drive, self.current, self.archive = drive, None, None
        self.manifest = {}
        self.metadata = {}

    def meta(self, reference):
        key = reference["fileId"]
        if key not in self.metadata:
            meta = self.drive.guard(key)
            if meta.get("parents") != [ARCHIVE_FOLDER] or int(meta.get("size", -1)) != reference["archiveBytes"]:
                raise ValueError("Legacy archive location or size changed")
            self.metadata[key] = meta
        return self.metadata[key]

    def read(self, reference, limit):
        self.meta(reference)
        expected = (reference["fileId"], reference["archiveSha256"])
        if self.current != expected:
            self.close()
            data = self.drive.read(reference["fileId"], MAX_ARCHIVE_BYTES)
            if len(data) != reference["archiveBytes"] or sha(data) != reference["archiveSha256"]:
                raise ValueError("Legacy archive SHA-256 mismatch")
            self.archive = tarfile.open(fileobj=io.BytesIO(data), mode="r:")
            seen = set()
            for member in self.archive.getmembers():
                path = PurePosixPath(member.name)
                if path.is_absolute() or ".." in path.parts or "\\" in member.name or member.name in seen or not member.isfile():
                    self.close()
                    raise ValueError("Unsafe legacy archive member")
                seen.add(member.name)
            manifest = self.archive.getmember("batch.json")
            if manifest.size > 2_500_000:
                raise ValueError("Legacy archive manifest exceeds RAM limit")
            with self.archive.extractfile(manifest) as stream:
                self.manifest = {item["key"]: item for item in json.loads(stream.read())["files"]}
            self.current = expected
        descriptor = self.manifest.get(reference["key"], {})
        if any(descriptor.get(field) != reference[other] for field, other in (("sha256", "sha256"), ("bytes", "bytes"), ("archivePath", "member"))):
            raise ValueError("Legacy archive manifest does not match the receipt")
        member = self.archive.getmember(reference["member"])
        if member.size != reference["bytes"] or not 0 < member.size <= limit:
            raise ValueError("Legacy archive member size mismatch")
        with self.archive.extractfile(member) as stream:
            data = stream.read(limit + 1)
        if len(data) != member.size or sha(data) != reference["sha256"]:
            raise ValueError("Legacy archive member SHA-256 mismatch")
        return data

    def close(self):
        if self.archive:
            # tarfile leaves externally supplied BytesIO open; close both explicitly.
            buffer = self.archive.fileobj
            self.archive.close()
            buffer.close()
        self.archive, self.current, self.manifest = None, None, {}
