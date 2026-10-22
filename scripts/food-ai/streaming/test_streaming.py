import builtins
import copy
import io
import json
import unittest
import tarfile
import errno
import os
from unittest.mock import patch
from types import SimpleNamespace

import numpy as np
from PIL import Image
from drive_store import DriveStore, MissingDriveFolder, private, encoded, sha
from hybrid import CONTRACT, arrays, clean_image, fit, evaluate, model_revoked, pack_cache, unpack_cache, partition, promotion, sample_weights, validate_record
import pipeline
import collector
from legacy import ARCHIVE_FOLDER, ArchiveReader, archive_index, reviewed_legacy_record, source_index
from features import Features


def row(index=0, source="public_base", label="rice"):
    key = sha(str(index).encode())
    embedding = np.zeros(512)
    embedding[index % 512] = 1
    return {"id": str(index), "imageFileId": "image" + str(index), "imageSha256": key, "dhash": f"{int(key[:16],16):016x}",
        "source": source, "confirmedFoodId": label, "embedding": embedding.tolist(), "scores": [.5, .5],
        "provenance": {"pageUrl": "https://commons.wikimedia.org/wiki/Example", "license": "CC0", "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/", "attribution": "Example"},
        "consent": {"granted": True, "version": "food-photo-training-v2", "purpose": "food-recognition", "at": "2026-10-15T00:00:00Z"},
        "review": {"method": "human", "decision": "accepted", "imageSha256": key, "foodId": label, "reviewer": "test", "reviewedAt": "2026-10-15T00:00:00Z", "confidence": .95}}


class HybridTests(unittest.TestCase):
    def test_explicit_consent_and_independent_review_required(self):
        r = row(source="app_user_corrected")
        validate_record(r, ["rice", "natto"])
        r["consent"]["granted"] = False
        with self.assertRaises(ValueError): validate_record(r, ["rice", "natto"])
        r = row()
        r["review"]["method"] = "clip-prediction"
        with self.assertRaises(ValueError): validate_record(r, ["rice", "natto"])
        r = row()
        r["provenance"]["license"] = "CC BY-NC"
        with self.assertRaises(ValueError): validate_record(r, ["rice", "natto"])

    def test_hash_group_stability_and_cross_source_leakage(self):
        a, b = row(0), row(1)
        b["dhash"] = a["dhash"]
        registry = {"assignments": {a["imageSha256"]: {"label": "rice", "split": "test", "dhash": a["dhash"]}}}
        rows, updated, _ = partition([a, b], registry)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["split"], "test")
        self.assertEqual(updated["assignments"][b["imageSha256"]]["split"], "test")
        self.assertEqual(len(registry["assignments"]), 1)
        b["source"] = "app_user_corrected"
        rows, _, quarantined = partition([a, b], registry)
        self.assertEqual(rows, [])
        self.assertEqual(len(quarantined), 2)

    def test_scene_grouping_and_historical_conflicts(self):
        a, b = row(2), row(3)
        a["sceneId"] = b["sceneId"] = "same-plate"
        history = {"assignments": {a["imageSha256"]: {"label": "rice", "split": "train", "dhash": a["dhash"]}, b["imageSha256"]: {"label": "rice", "split": "test", "dhash": b["dhash"]}}}
        rows, _, rejected = partition([a, b], history)
        self.assertFalse(rows)
        self.assertEqual(len(rejected), 2)

    def test_machine_reviews_never_become_test_truth(self):
        r = row(7, source="autonomous_public")
        r["review"]["method"] = "local-vlm"
        history = {"assignments": {r["imageSha256"]: {"label": "rice", "split": "test", "dhash": r["dhash"]}}}
        self.assertEqual(partition([r], history)[0], [])

    def test_explicit_eval_folder_never_becomes_training(self):
        r = {**row(8), "requiredSplit": "test"}
        rows, _, _ = partition([r], {"assignments": {}})
        self.assertEqual(rows[0]["split"], "test")
        history = {"assignments": {r["imageSha256"]: {"label": "rice", "split": "train", "dhash": r["dhash"]}}}
        rows, _, rejected = partition([r], history)
        self.assertEqual(rows, [])
        self.assertEqual(rejected, [r["id"]])

    def test_revocations_withdraw_heads_by_id_or_image_hash(self):
        model = {"trainingIds": ["one"], "trainingHashes": ["abc"]}
        self.assertTrue(model_revoked(model, {"ids": ["one"]}))
        self.assertTrue(model_revoked(model, {"imageSha256": ["abc"]}))
        self.assertFalse(model_revoked(model, {"ids": ["other"], "imageSha256": ["def"]}))
        self.assertTrue(model_revoked({"trainingIds": ["one"]}, {"imageSha256": ["abc"]}))

    def test_sample_weights_maintain_replay_mass(self):
        rows = [row(), row(1, "app_user_confirmed"), row(2, "app_user_corrected"), row(3, "autonomous_public")]
        weights = sample_weights(rows)
        self.assertAlmostEqual(weights[0], .6)
        self.assertAlmostEqual(weights[2] / weights[1], 5/3)
        with self.assertRaises(ValueError): sample_weights(rows[1:])

    def test_npz_roundtrip_contract_and_no_pickle(self):
        data = pack_cache([row()], "fingerprint")
        output = unpack_cache(data, "fingerprint")
        self.assertEqual(output[0]["imageSha256"], row()["imageSha256"])
        self.assertEqual(output[0]["embedding"], row()["embedding"])
        with self.assertRaises(ValueError): unpack_cache(data, "other")

    def test_training_updates_embedding_head_and_safe_stop(self):
        rows = [row(i, label="rice" if i % 2 else "natto") for i in range(20)]
        model = fit(rows, ["rice", "natto"], ["rice dish", "natto dish"], epochs=50)
        self.assertEqual(model["schemaVersion"], 2)
        self.assertGreater(evaluate(rows, ["rice", "natto"], model)["top1"], 10)
        with self.assertRaises(InterruptedError): fit(rows, ["rice", "natto"], ["rice", "natto"], stopping=lambda: True)

    def test_promotion_rejects_short_holdout_or_regression(self):
        rows = [row(i) for i in range(10)]
        result = evaluate(rows, ["rice", "natto"])
        self.assertFalse(promotion(result, result, result, result, ["rice", "natto"])["passed"])

    def test_on_memory_image_exif_removal(self):
        image = Image.new("RGB", (80, 80), "green")
        exif = Image.Exif()
        exif[270] = "private metadata"
        source = io.BytesIO()
        image.save(source, "JPEG", exif=exif)
        clean, dhash = clean_image(source.getvalue())
        with Image.open(io.BytesIO(clean)) as decoded:
            self.assertFalse(decoded.getexif())
        self.assertEqual(len(dhash), 16)

    def test_malformed_features_rejected(self):
        r = row()
        r["embedding"][0] = float("nan")
        with self.assertRaises(ValueError): arrays([r], ["rice", "natto"])


class DriveSafetyTests(unittest.TestCase):
    def test_feature_worker_returns_fixed_codes_and_preserves_cache_exception_for_classification(self):
        for failure, code, expected in [(None, "model_asset_missing", "CLIP model_asset_missing"),
            (None, "private-token", "CLIP feature extraction failed"),
            (RuntimeError("Drive HTTP 403"), "model_cache_failed", "Drive HTTP 403")]:
            reader, writer = os.pipe()
            os.write(writer, (json.dumps({"ok": False, "error": code}) + "\n").encode())
            os.close(writer)
            with os.fdopen(reader, "rb") as output:
                feature = object.__new__(Features)
                feature.failure = failure
                feature._stdout_buffer = b""
                feature.process = SimpleNamespace(stdin=io.BytesIO(), stdout=output)
                with self.assertRaisesRegex(RuntimeError, expected): feature.call({"op": "init"}, timeout=1)

    def test_feature_worker_reads_warning_and_reply_without_waiting_for_more_output(self):
        reader, writer = os.pipe()
        try:
            # Keep the writer open like a persistent worker awaiting the next
            # request. Both lines arrive in one OS read; no EOF can wake select.
            os.write(writer, b'native warning\n[1,2]\n{"diagnostic":true}\n{"ok":true,"value":7}\n')
            with os.fdopen(reader, "rb") as output:
                feature = object.__new__(Features)
                feature.failure = None
                feature._stdout_buffer = b""
                feature.process = SimpleNamespace(stdin=io.BytesIO(), stdout=output)
                self.assertEqual(feature.call({"op": "init"}, timeout=.1)["value"], 7)
                self.assertEqual(json.loads(feature.process.stdin.getvalue()), {"op": "init"})
        finally:
            os.close(writer)

    def test_feature_worker_preserves_partial_line_and_has_bounded_timeout(self):
        import threading
        reader, writer = os.pipe()
        completion = threading.Timer(.01, lambda: os.write(writer, b'"value":8}\n'))
        try:
            os.write(writer, b'{"ok":true,')
            completion.start()
            with os.fdopen(reader, "rb") as output:
                feature = object.__new__(Features)
                feature.failure = None
                feature._stdout_buffer = b""
                feature.process = SimpleNamespace(stdin=io.BytesIO(), stdout=output)
                self.assertEqual(feature.call({"op": "init"}, timeout=1)["value"], 8)
                self.assertEqual(feature._stdout_buffer, b"")
                with self.assertRaises(TimeoutError): feature.call({"op": "extract"}, timeout=.01)
        finally:
            completion.join()
            os.close(writer)

    def test_diagnostics_distinguish_recovery_actions_without_provider_text(self):
        cases = [
            (type("DefaultCredentialsError", (Exception,), {})("private-token"), "drive_auth_missing"),
            (type("RefreshError", (Exception,), {})("private-token"), "drive_auth_expired"),
            (RuntimeError("Drive HTTP 403"), "drive_access_denied"),
            (RuntimeError("Drive HTTP 503"), "drive_temporarily_unavailable"),
            (RuntimeError("Drive free capacity unavailable or insufficient"), "drive_capacity"),
            (OSError(errno.EADDRINUSE, "private-token"), "run_already_active"),
            (ValueError("Image and ground-truth hash mismatch private-token"), "data_verification_failed"),
            (RuntimeError("CLIP feature extraction failed"), "feature_extraction_failed"),
            (RuntimeError("private-token"), "unexpected_failure"),
        ]
        for error, expected in cases:
            status = pipeline.failure_status(error)
            self.assertEqual(status["diagnosticCode"], expected)
            self.assertNotIn("private-token", json.dumps(status))
        self.assertTrue(pipeline.failure_status(RuntimeError("Drive HTTP 503"))["retryable"])

    def test_preflight_distinguishes_missing_layout_without_writes(self):
        class FakeDrive:
            def capacity(self, amount):
                assert amount == 0
            def layout(self, create=False):
                assert create is False
                raise MissingDriveFolder("app inbox")
        output = io.StringIO()
        with patch("pipeline.require_owner_learning_state"), patch("pipeline.local_json", return_value={"pending": []}), patch("sys.stdout", output):
            pipeline.run(SimpleNamespace(preflight=True), FakeDrive())
        self.assertEqual(json.loads(output.getvalue())["stage"], "setup_required")

    def test_preflight_does_not_mask_private_or_auth_errors(self):
        class FakeDrive:
            def capacity(self, amount): pass
            def layout(self, create=False): raise ValueError("Not private")
        with patch("pipeline.require_owner_learning_state"), patch("pipeline.local_json", return_value={"pending": []}), self.assertRaises(ValueError):
            pipeline.run(SimpleNamespace(preflight=True), FakeDrive())

    def test_pending_queue_blocks_layout_creation(self):
        class FakeDrive:
            def capacity(self, amount): pass
            def layout(self, create=False): raise AssertionError("No folders may be created")
        with patch("pipeline.require_owner_learning_state"), patch("pipeline.local_json", return_value={"pending": [{}]}), self.assertRaisesRegex(RuntimeError, "queue"):
            pipeline.run(SimpleNamespace(preflight=False), FakeDrive())

    def test_private_parent_and_permissions_fail_closed(self):
        meta = {"trashed": False, "parents": ["foodDB"], "permissions": [{"type": "user", "role": "owner"}]}
        private(meta, "foodDB")
        for mutation in [{"permissions": []}, {"trashed": True}, {"parents": ["outside"]}, {"permissions": [{"type": "anyone", "role": "reader"}]}]:
            with self.assertRaises(ValueError): private({**meta, **mutation}, "foodDB")

    def test_existing_same_name_requires_complete_remote_read(self):
        store = DriveStore(session=object())
        store.guard = lambda _: {}
        store.find = lambda *_: {"id": "existing"}
        reads = []
        store.read = lambda file_id: reads.append(file_id) or b"hello"
        self.assertEqual(store.put("root", "a", b"hello"), "existing")
        self.assertEqual(reads, ["existing"])
        with self.assertRaises(ValueError): store.put("root", "a", b"different")

    def test_new_upload_requires_fresh_readback_match(self):
        saved = {"id": "new", "parents": ["root"], "trashed": False, "permissions": [{"type": "user", "role": "owner"}]}
        session = SimpleNamespace(request=lambda *a, **kw: SimpleNamespace(ok=True, headers={"Location": "https://www.googleapis.com/upload/session"}),
            put=lambda *a, **kw: SimpleNamespace(ok=True, status_code=200, json=lambda: saved, close=lambda: None))
        store = DriveStore(session=session)
        store.guard = lambda _: {}
        store.find = lambda *_: None
        store.capacity = lambda _: None
        store.read = lambda _: b"corrupted remote bytes"
        with self.assertRaisesRegex(RuntimeError, "readback SHA-256"):
            store.put("root", "photo.jpg", b"real bytes")

    def test_historical_split_import_does_not_reassign(self):
        history = {"assignments": {"hash": {"split": "train"}}}
        with self.assertRaises(ValueError): pipeline.merge_history({"assignments": {"hash": {"split": "test"}}}, history)

    def test_empty_pipeline_writes_only_fake_drive(self):
        class FakeDrive:
            def __init__(self): self.saved = {}
            def layout(self, create=False):
                from drive_store import LAYOUT
                return {key: key for key in LAYOUT}
            def capacity(self, _): pass
            def children(self, *_): return []
            def find(self, *_): return None
            def json(self, parent, name, default=None): return default
            def put_json(self, parent, name, value, replace=False): self.saved[(parent,name)] = value; return "fake-id"
            def put(self, parent, name, data, **_): self.saved[(parent,name)] = data; return "fake-id"
        drive = FakeDrive()
        options = type("Options", (), {"preflight": False, "collect": False, "import_existing": False})()
        original_open = builtins.open
        def readonly(file, mode="r", *args, **kwargs):
            if any(flag in mode for flag in "wax+"):
                raise AssertionError("Local write attempted")
            return original_open(file, mode, *args, **kwargs)
        with patch("pipeline.require_owner_learning_state"), patch("builtins.open", readonly), patch("sys.stdout", io.StringIO()), patch("pipeline.archived_records", return_value=[]):
            pipeline.run(options, drive)
        self.assertEqual(drive.saved[("logs", "status.json")]["stage"], "not_adopted")
        self.assertFalse(any(parent == "candidates" for parent, _ in drive.saved))

    def test_rejected_photo_is_not_permanently_counted_as_review_pending(self):
        saved = {}
        record = row(source="autonomous_public")
        record["review"]["decision"] = "rejected"
        from drive_store import LAYOUT
        drive = SimpleNamespace(capacity=lambda _: None, layout=lambda **_: {key: key for key in LAYOUT},
            children=lambda key: [{"id": "rejected", "name": "rejected.json"}] if key == "auto_inbox" else [],
            read=lambda *_: encoded(record), find=lambda *_: None, json=lambda parent, name, default=None: default,
            put_json=lambda parent, name, value, **_: saved.update({(parent, name): value}) or "id",
            put=lambda *a, **_: "id")
        def local(relative, fallback=None):
            return {"lib/food-ai/test-photo-labels.json": [["rice", "rice"]],
                "lib/data/food-library.json": {"foods": []}}.get(relative, fallback)
        with patch("pipeline.require_owner_learning_state"), patch("pipeline.local_json", local), patch("pipeline.archived_records", return_value=[]), patch("sys.stdout", io.StringIO()):
            pipeline.run(SimpleNamespace(preflight=False, collect=False, import_existing=False), drive)
        report = next(value for value in saved.values() if isinstance(value, dict) and "pendingReview" in value)
        self.assertEqual(report["pendingReview"], 0)
        self.assertEqual(report["rejectedReview"], 1)


class LegacyArchiveTests(unittest.TestCase):
    def legacy_record(self):
        value = row()
        review = dict(value["review"])
        review.pop("foodId")
        record = {"schemaVersion": 1, "id": "commons-42", "labelVerified": True,
            "confirmedFoodId": "rice", "review": review}
        source = {"id": "commons-42", "sha256": value["imageSha256"], "license": "CC0",
            "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/", "filePage": "https://commons.wikimedia.org/?curid=42", "author": "Example"}
        return record, source

    def test_old_review_and_separate_source_are_adapted_without_mutating_evidence(self):
        original, source = self.legacy_record()
        before = copy.deepcopy(original)
        result = reviewed_legacy_record(original, source_index([source]), ["rice", "natto"])
        self.assertEqual(result["review"]["foodId"], "rice")
        self.assertEqual(result["legacyReview"], before["review"])
        self.assertEqual(original, before)
        self.assertEqual(result["provenance"]["originalSource"], source)

    def test_adapter_does_not_turn_pending_guesses_or_conflicting_hashes_into_truth(self):
        original, source = self.legacy_record()
        self.assertIsNone(reviewed_legacy_record({**original, "labelVerified": False}, {source["id"]: source}, ["rice"]))
        original["review"]["foodId"] = "natto"
        self.assertIsNone(reviewed_legacy_record(original, {source["id"]: source}, ["rice", "natto"]))
        with self.assertRaisesRegex(ValueError, "hash"):
            reviewed_legacy_record(original, {source["id"]: {**source, "sha256": "f" * 64}}, ["rice"])

    def archive(self, unsafe=None, image=b"image bytes"):
        key, digest = "commons/images/commons-42.jpg", sha(image)
        member_name = "objects/" + digest
        manifest = {"files": [{"key": key, "sha256": digest, "bytes": len(image), "archivePath": member_name}]}
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode="w") as archive:
            for name, data in [("batch.json", encoded(manifest)), (member_name, image)] + ([(unsafe, b"x")] if unsafe else []):
                member = tarfile.TarInfo(name)
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
        data = output.getvalue()
        reference = {"fileId": "archive", "archiveSha256": sha(data), "archiveBytes": len(data),
            "key": key, "member": member_name, "sha256": digest, "bytes": len(image)}
        return data, reference

    def store(self, data):
        reads = []
        drive = SimpleNamespace(guard=lambda file_id: {"parents": [ARCHIVE_FOLDER], "size": len(data), "version": "1"},
            read=lambda file_id, limit: reads.append(file_id) or data)
        return drive, reads

    def test_full_tar_and_member_hashes_are_verified_with_one_ram_download(self):
        data, ref = self.archive()
        drive, reads = self.store(data)
        reader = ArchiveReader(drive)
        try:
            self.assertEqual(reader.read(ref, 5_000_000), b"image bytes")
            self.assertEqual(reader.read(ref, 5_000_000), b"image bytes")
            self.assertEqual(reads, ["archive"])
        finally:
            reader.close()

    def test_corruption_traversal_size_and_ledger_mismatch_are_rejected(self):
        data, ref = self.archive()
        for reference, raw, error in [
            (ref, data[:-1] + b"x", "archive SHA-256"),
            ({**ref, "bytes": 1}, data, "manifest"),
            ({**ref, "key": "commons/images/commons-43.jpg"}, data, "manifest"),
        ]:
            reader = ArchiveReader(self.store(raw)[0])
            try:
                with self.assertRaisesRegex(ValueError, error): reader.read(reference, 5_000_000)
            finally: reader.close()
        data, ref = self.archive(unsafe="../outside.jpg")
        reader = ArchiveReader(self.store(data)[0])
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            reader.read(ref, 5_000_000)
        reader.close()
        data, ref = self.archive()
        reader = ArchiveReader(self.store(data)[0])
        with self.assertRaisesRegex(ValueError, "size"):
            reader.read(ref, 2)
        reader.close()

    def test_archive_receipt_maps_logical_keys_to_hash_objects_and_rejects_unverified_receipts(self):
        data, ref = self.archive()
        batch = {"dataset": "commons", "status": "uploaded", "bytes": len(data), "sha256": sha(data),
            "files": [{"key": ref["key"], "sha256": ref["sha256"], "bytes": ref["bytes"]}],
            "receipt": {"folderId": ARCHIVE_FOLDER, "remoteId": "archive", "downloadVerification": {"bytes": len(data), "sha256": sha(data)}}}
        self.assertEqual(archive_index({"batches": [batch]})[ref["key"]][ref["sha256"]], ref)
        batch["receipt"]["downloadVerification"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "receipt"):
            archive_index({"batches": [batch]})

    def test_pipeline_reads_remote_archive_then_reuses_features_without_reuploading_originals(self):
        image = io.BytesIO()
        Image.new("RGB", (80, 80), "green").save(image, "JPEG")
        original, source = self.legacy_record()
        original["review"]["imageSha256"] = source["sha256"] = sha(image.getvalue())
        record = reviewed_legacy_record(original, {source["id"]: source}, ["rice", "natto"])
        evidence = {"imageArchive": ("images", image.getvalue()), "recordArchive": ("records", encoded(original)),
            "sourceArchive": ("attribution", encoded(source))}
        descriptors = [{"key": f"commons/{kind}/commons-42." + ("jpg" if kind == "images" else "json"),
            "bytes": len(data), "sha256": sha(data), "archivePath": "objects/" + sha(data)} for kind, data in evidence.values()]
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode="w") as tar:
            for name, data in [("batch.json", encoded({"files": descriptors}))] + [("objects/" + sha(data), data) for _, data in evidence.values()]:
                member = tarfile.TarInfo(name); member.size = len(data); tar.addfile(member, io.BytesIO(data))
        archive = output.getvalue()
        for key, descriptor in zip(evidence, descriptors):
            record[key] = {"fileId": "archive", "archiveSha256": sha(archive), "archiveBytes": len(archive),
                "key": descriptor["key"], "member": descriptor["archivePath"], "bytes": descriptor["bytes"], "sha256": descriptor["sha256"]}
        record.update({"imageFileId": "archive", "recordFileId": "archive", "sourceFolderId": ARCHIVE_FOLDER,
            "recordVersion": record["recordArchive"]["sha256"]})

        class FakeDrive:
            def __init__(self): self.saved, self.reads, self.uploads = {}, [], []
            def capacity(self, _): pass
            def layout(self, create=False):
                from drive_store import LAYOUT
                return {key: key for key in LAYOUT}
            def children(self, _): return []
            def guard(self, _): return {"parents": [ARCHIVE_FOLDER], "size": len(archive), "version": "1"}
            def find(self, parent, name): return {"id": (parent, name)} if (parent, name) in self.saved else None
            def json(self, parent, name, default=None): return self.saved.get((parent, name), default)
            def read(self, file_id, limit=None):
                self.reads.append(file_id)
                return archive if file_id == "archive" else self.saved[file_id]
            def put(self, parent, name, data, **_): self.uploads.append((parent, name)); self.saved[(parent,name)] = data; return (parent, name)
            def put_json(self, parent, name, value, **_): self.uploads.append((parent, name)); self.saved[(parent,name)] = copy.deepcopy(value); return (parent, name)
        class FakeFeatures:
            calls = 0
            def __init__(self, *_): pass
            def extract(self, raw, _):
                self.__class__.calls += 1
                assert raw == image.getvalue()
                return {"embedding": row()["embedding"], "scores": [.5, .5]}
            def close(self): pass
        def local(relative, fallback=None):
            return {"lib/food-ai/test-photo-labels.json": [["rice", "rice"], ["natto", "natto"]],
                "lib/data/food-library.json": {"foods": []}}.get(relative, fallback)
        drive = FakeDrive()
        options = SimpleNamespace(preflight=False, collect=False, import_existing=False)
        with patch("pipeline.require_owner_learning_state"), patch("pipeline.local_json", local), patch("pipeline.archived_records", side_effect=lambda *a: [copy.deepcopy(record)]), patch("pipeline.Features", FakeFeatures), patch("sys.stdout", io.StringIO()):
            pipeline.run(options, drive)
            self.assertEqual(FakeFeatures.calls, 1)
            archive_reads = drive.reads.count("archive")
            self.assertEqual(archive_reads, 2)  # one evidence pass, one image pass
            pipeline.run(options, drive)
            self.assertEqual(FakeFeatures.calls, 1)
            self.assertEqual(drive.reads.count("archive"), archive_reads)
        self.assertTrue(all(parent in {"cache", "logs", "app_train", "app_eval", "auto_train"} for parent, _ in drive.uploads))
        self.assertEqual(drive.saved[("logs", "status.json")]["stage"], "not_adopted")


class CollectionTests(unittest.TestCase):
    def test_continuation_persists_to_drive_and_avoids_reupload(self):
        class FakeDrive:
            def __init__(self): self.saved = {}
            def children(self, *_): return [{"name": "commons-42.json"}]
            def json(self, *args): return {"natto": {"continuation": {"gsroffset": 10}}}
            def put_json(self, folder, name, value, **kwargs): self.saved[name] = copy.deepcopy(value)
        drive = FakeDrive()
        calls = []
        def get(url, **kwargs):
            calls.append((url, kwargs))
            self.assertIn("w/api.php", url)  # The already uploaded image must not be re-downloaded.
            return {"query": {"pages": {"42": {"pageid": 42}}}, "continue": {"gsroffset": 20}}
        with patch("acquisition.fetch_json", lambda url, hosts, **kw: get(url, **kw)):
            result = collector.collect(drive, "inbox", [("natto", "natto")], ["natto"], lambda: False, lambda *_: None, state_folder="logs")
        self.assertEqual(result, [])
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1]["params"]["gsroffset"], 10)
        self.assertEqual(drive.saved["commons-continuation.json"]["natto"]["continuation"], {"gsroffset": 20})

    def test_rate_limit_stops_before_images_or_checkpoint(self):
        drive = SimpleNamespace(children=lambda _: [], json=lambda *a: {},
            put_json=lambda *a, **kw: self.fail("No checkpoint on rate limit"))
        with patch("acquisition.fetch_json", side_effect=RuntimeError("rate limit")):
            with self.assertRaisesRegex(RuntimeError, "rate limit"):
                collector.collect(drive, "inbox", [("natto", "natto")], ["natto"], lambda: False, lambda *_: None)


if __name__ == "__main__": unittest.main()
