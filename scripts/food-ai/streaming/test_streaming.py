import builtins
import copy
import io
import json
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import numpy as np
from PIL import Image
from drive_store import DriveStore, MissingDriveFolder, private, encoded, sha
from hybrid import CONTRACT, arrays, clean_image, fit, evaluate, model_revoked, pack_cache, unpack_cache, partition, promotion, sample_weights, validate_record
import pipeline
import collector


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
    def test_preflight_distinguishes_missing_layout_without_writes(self):
        class FakeDrive:
            def capacity(self, amount):
                assert amount == 0
            def layout(self, create=False):
                assert create is False
                raise MissingDriveFolder("app inbox")
        output = io.StringIO()
        with patch("pipeline.local_json", return_value={"pending": []}), patch("sys.stdout", output):
            pipeline.run(SimpleNamespace(preflight=True), FakeDrive())
        self.assertEqual(json.loads(output.getvalue())["stage"], "setup_required")

    def test_preflight_does_not_mask_private_or_auth_errors(self):
        class FakeDrive:
            def capacity(self, amount): pass
            def layout(self, create=False): raise ValueError("Not private")
        with patch("pipeline.local_json", return_value={"pending": []}), self.assertRaises(ValueError):
            pipeline.run(SimpleNamespace(preflight=True), FakeDrive())

    def test_pending_queue_blocks_layout_creation(self):
        class FakeDrive:
            def capacity(self, amount): pass
            def layout(self, create=False): raise AssertionError("No folders may be created")
        with patch("pipeline.local_json", return_value={"pending": [{}]}), self.assertRaisesRegex(RuntimeError, "queue"):
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
            put=lambda *a, **kw: SimpleNamespace(ok=True, json=lambda: saved))
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
        with patch("builtins.open", readonly), patch("sys.stdout", io.StringIO()):
            pipeline.run(options, drive)
        self.assertEqual(drive.saved[("logs", "status.json")]["stage"], "not_adopted")
        self.assertFalse(any(parent == "candidates" for parent, _ in drive.saved))


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
