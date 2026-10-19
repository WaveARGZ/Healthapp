"""No network, real accounts, images on disk, or cache writes in these tests."""
import copy
import io
import json
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

import acquisition as a
import collector
import pipeline
from drive_store import encoded, sha
from hybrid import sample_weights, validate_record
from test_streaming import row


class MemoryDrive:
    def __init__(self): self.files = {}; self.uploads = []
    def json(self, folder, name, default=None):
        file = self.find(folder, name)
        return json.loads(self.read(file["id"])) if file else copy.deepcopy(default)
    def find(self, folder, name):
        return next(({"id": key} for key, (parent, title, _) in self.files.items() if (parent, title) == (folder, name)), None)
    def read(self, key, *_): return self.files[key][2]
    def guard(self, key): return {"parents": [self.files[key][0]]}
    def capacity(self, *_): pass
    def put(self, folder, name, data, mime=None, replace=False):
        previous = self.find(folder, name)
        key = previous["id"] if previous else "file-" + str(len(self.files))
        if previous and not replace and self.read(key) != data: raise ValueError("conflict")
        self.files[key] = (folder, name, data)
        self.uploads.append(name)
        return key
    def put_json(self, folder, name, data, replace=False): return self.put(folder, name, encoded(data), replace=replace)


def spec():
    return {"dataset": "owner/food", "revision": "a" * 40, "config": "default", "split": "test", "splitRole": "test",
        "imageColumn": "image", "labelColumn": "label", "labelMap": {"0": "rice"},
        "rights": {"imagesCovered": True, "commercialUse": True, "reviewer": "independent rights review",
            "reviewedAt": "2026-10-15", "evidenceUrl": "https://example.com/license", "attribution": "creator",
            "license": "CC0", "licenseUrl": a.LICENSES["CC0"]}}


class AcquisitionTests(unittest.TestCase):
    def test_legacy_archive_array_preserved_and_ids_not_downloaded_again(self):
        state = {"batches": [{"dataset": "commons", "files": [{"key": "commons/commons-42.jpg"}]}]}
        with patch("pipeline.local_json", return_value=state):
            self.assertIn("commons-42", pipeline.legacy_collection_ids())
        drive = MemoryDrive()
        drive.children = lambda *_: []
        with patch("acquisition.fetch_json", return_value={"query": {"pages": {"42": {"pageid": 42}}}}), patch("acquisition.fetch_bytes") as fetch:
            collector.collect(drive, "inbox", [("rice", "rice")], ["rice"], lambda: False, lambda *_: None, skip_ids={"commons-42"})
        fetch.assert_not_called()

    def test_planner_ignores_eval_and_free_text_and_duplicate_scenes(self):
        train = row(1, "app_user_corrected", "rice")
        test = row(2, "app_user_corrected", "natto")
        duplicate = {**row(3, "app_user_corrected", "rice"), "sceneId": "same"}
        train["sceneId"] = "same"
        registry = {"assignments": {r["imageSha256"]: {"split": "test" if r is test else "train", "label": r["confirmedFoodId"]} for r in [train, test, duplicate]}}
        plan = a.plan_acquisition([train, test, duplicate], [train, test], registry,
            [("rice", "white rice"), ("natto", "natto")], {"foods": [{"id": "rice", "name": "白米"}, {"id": "new", "name": "新料理"}]})
        rice = next(r for r in plan["priorities"] if r["foodId"] == "rice")
        natto = next(r for r in plan["priorities"] if r["foodId"] == "natto")
        self.assertEqual(rice["trainGroups"], 1)
        self.assertEqual(natto["trainCorrections"], 0)
        self.assertEqual(natto["trainErrors"], 0)
        self.assertEqual(plan["catalogOutsideModel"], [{"foodId": "new", "name": "新料理"}])

    def test_autonomous_mass_cannot_swamp_app_and_base_floor(self):
        rows = [row(0), row(1, "app_user_corrected")] + [row(i+2, "autonomous_public") for i in range(100)]
        w = sample_weights(rows)
        self.assertGreaterEqual(w[0], .6 - 1e-10)
        self.assertLessEqual(w[2:].sum(), .8 * w[1] + 1e-10)

    def test_http_rejects_redirect_byte_overflow_and_revision_drift(self):
        class Response:
            status_code = 200
            headers = {}
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def iter_content(self, _): yield b"abcdef"
        response = Response()
        with patch("acquisition.requests.get", return_value=response) as request:
            with self.assertRaises(a.SourceUnavailable): a.fetch_bytes("https://example.com/a", {"example.com"}, 2)
            self.assertFalse(request.call_args.kwargs["allow_redirects"])
            with self.assertRaises(a.SourceUnavailable): a.fetch_bytes("https://example.com/a", {"example.com"}, 20, expected_revision="pin")
            response.status_code = 302
            with self.assertRaises(a.SourceUnavailable): a.fetch_bytes("https://example.com/a", {"example.com"}, 20)
        for url in ["http://example.com/a", "https://127.0.0.1/a", "https://user@example.com/a"]:
            with self.assertRaises(ValueError): a.fetch_bytes(url, {"example.com"}, 20)

    def test_hf_discovery_is_not_image_license_approval(self):
        drive = MemoryDrive(); history = a.History(drive, "cache")
        with patch("acquisition.fetch_json", return_value=[{"id": "owner/food", "sha": "a" * 40, "tags": ["license:cc-by-4.0"]}, {"id": "owner/private", "private": True}]) as request:
            a.discover_hf(drive, "logs", history, ["rice"], lambda: False)
            a.discover_hf(drive, "logs", history, ["rice"], lambda: False)
        self.assertEqual(request.call_count, 1)
        records = [json.loads(data) for _, name, data in drive.files.values() if name.startswith("hf-search")]
        self.assertEqual(records[0]["candidates"][0]["status"], "image_rights_review_required")
        self.assertEqual(len(records[0]["candidates"]), 1)

    def test_hf_requires_image_rights_pinned_revision_and_known_mapping(self):
        a.validate_hf_registry(spec(), ["rice"])
        for change in [{"revision": "main"}, {"rights": {}}, {"labelMap": {"0": "secret user text"}}, {"splitRole": "unknown"}]:
            with self.assertRaises(ValueError): a.validate_hf_registry({**spec(), **change}, ["rice"])

    def test_hf_streams_one_image_preserves_official_test_and_skips_repeat(self):
        drive = MemoryDrive(); history = a.History(drive, "cache")
        drive.put_json("cache", "approved-hf-sources.json", {"schemaVersion": 1, "datasets": [spec()]})
        image = io.BytesIO(); Image.new("RGB", (64, 64), "red").save(image, format="JPEG")
        calls = []
        def get(url, *args, **kwargs):
            calls.append(url)
            if "/api/datasets/" in url: return {"sha": "a" * 40}
            self.assertEqual(kwargs["expected_revision"], "a" * 40)
            return {"partial": False, "num_rows_total": 1, "rows": [{"row_idx": 0, "row": {"label": 0, "image": {"src": "https://datasets-server.huggingface.co/image?Signature=secret"}}, "truncated_cells": []}]}
        folders = {"auto_inbox": "inbox", "cache": "cache"}
        with patch("acquisition.fetch_json", get), patch("acquisition.fetch_bytes", return_value=image.getvalue()) as download, patch("acquisition.local_review", return_value={"decision": "pending"}):
            result = a.collect_hf(drive, folders, history, [("rice", "rice")], ["rice"], lambda: False, lambda *_: None)
            again = a.collect_hf(drive, folders, history, [("rice", "rice")], ["rice"], lambda: False, lambda *_: None)
        self.assertEqual(download.call_count, 1)
        self.assertEqual(result[0]["requiredSplit"], "test")
        self.assertNotIn("Signature", json.dumps(result))
        self.assertEqual(again, [])
        with self.assertRaises(ValueError): validate_record(result[0], ["rice"])

    def test_hf_revision_change_stops_before_image_fetch(self):
        drive = MemoryDrive(); history = a.History(drive, "cache")
        drive.put_json("cache", "approved-hf-sources.json", {"schemaVersion": 1, "datasets": [spec()]})
        with patch("acquisition.fetch_json", return_value={"sha": "b" * 40}), patch("acquisition.fetch_bytes") as download:
            with self.assertRaises(ValueError): a.collect_hf(drive, {"cache": "cache"}, history, [("rice", "rice")], ["rice"], lambda: False, lambda *_: None)
        download.assert_not_called()

    def test_receipt_only_after_both_uploads_and_resume_after_checkpoint_failure(self):
        drive = MemoryDrive(); history = a.History(drive, "cache")
        with patch("acquisition.local_review", return_value={"decision": "pending"}), patch.object(history, "save", side_effect=RuntimeError("connection")):
            with self.assertRaises(RuntimeError): a.save_candidate(drive, "inbox", history, "one", b"bytes", "0" * 16, "rice", [("rice", "rice")], {})
        fresh = a.History(drive, "cache")
        with patch("acquisition.local_review", side_effect=AssertionError("Must reuse saved review")):
            result = a.save_candidate(drive, "inbox", fresh, "one", b"bytes", "0" * 16, "rice", [("rice", "rice")], {})
        self.assertEqual(drive.uploads.count("one.jpg"), 1)
        self.assertEqual(fresh.value["items"]["one"]["jsonFileId"], result["recordFileId"])

    def test_duplicate_image_preserves_conflicting_split_records(self):
        drive = MemoryDrive(); history = a.History(drive, "cache")
        with patch("acquisition.local_review", return_value={"decision": "pending"}):
            first = a.save_candidate(drive, "inbox", history, "one", b"bytes", "0" * 16, "rice", [("rice", "rice")], {}, {"requiredSplit": "train"})
            second = a.save_candidate(drive, "inbox", history, "two", b"bytes", "0" * 16, "rice", [("rice", "rice")], {}, {"requiredSplit": "test"})
        self.assertEqual(first["imageFileId"], second["imageFileId"])
        self.assertNotEqual(first["recordFileId"], second["recordFileId"])
        self.assertEqual(second["requiredSplit"], "test")
        self.assertNotIn("two.jpg", drive.uploads)

    def test_off_requires_usage_setup_and_never_returns_classifier_records(self):
        drive = MemoryDrive(); history = a.History(drive, "cache")
        with patch("acquisition.fetch_json") as fetch:
            a.collect_off(drive, {}, history, lambda: False)
        fetch.assert_not_called()
        image = io.BytesIO(); Image.new("RGB", (64, 64), "blue").save(image, format="JPEG")
        product = {"code": "12345678", "image_front_small_url": "https://images.openfoodfacts.org/front.jpg", "nutriments": {"proteins_100g": 10}, "last_modified_t": 12}
        with patch("acquisition.fetch_json", return_value={"products": [product]}), patch("acquisition.fetch_bytes", return_value=image.getvalue()):
            a.collect_off(drive, {"products": "products"}, history, lambda: False, "test@example.invalid", True)
        record = drive.json("products", "off-12345678-12.json")
        self.assertFalse(record["classifierEligible"])
        self.assertEqual(record["nutriments"], product["nutriments"])
        with self.assertRaises(ValueError): validate_record(record, ["rice"])

    def test_off_advances_pages_without_repeating_a_day(self):
        drive = MemoryDrive(); history = a.History(drive, "cache")
        history.source("openfoodfacts", nextPage=4, checkedOn="2000-01-01")
        with patch("acquisition.fetch_json", return_value={"products": []}) as fetch:
            a.collect_off(drive, {}, history, lambda: False, "test@example.invalid", True)
            a.collect_off(drive, {}, history, lambda: False, "test@example.invalid", True)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(fetch.call_args.args[2]["page"], 4)
        self.assertTrue(history.value["sources"]["openfoodfacts"]["complete"])


if __name__ == "__main__": unittest.main()
