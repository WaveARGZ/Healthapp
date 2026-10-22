"""In-memory checks for the public submission -> independent review boundary."""
import copy
import io
import json
import unittest
from unittest.mock import patch

from PIL import Image

import launcher
from drive_store import encoded, sha
from hybrid import validate_record


class ReviewTests(unittest.TestCase):
    def setUp(self):
        output = io.BytesIO()
        Image.new("RGB", (80, 80), "green").save(output, "JPEG")
        self.image = output.getvalue()
        self.record = {
            "schemaVersion": 2, "id": "food-photo-example-123", "imageFileId": "image-file",
            "imageSha256": sha(self.image), "requestFingerprint": "f" * 64,
            "source": "app_user_corrected", "confirmedFoodId": "custom:海鮮丼", "confirmedFoodName": "海鮮丼",
            "predictedFoodIds": [], "review": {"status": "pending"}, "nutritionProvenance": "user_estimate",
            "nutrition": {"calories": 0, "proteinG": 0, "fatG": 0, "carbsG": 0},
            "createdAt": "2026-10-21T01:00:00Z",
            "consent": {"granted": True, "version": "food-photo-training-v2", "purpose": "food-recognition", "at": "2026-10-21T01:00:00Z"},
        }
        self.files = {"app-json": copy.deepcopy(self.record)}
        self.folder = "app"
        owner = self

        class FakeDrive:
            def layout(self): return {"app_inbox": "app", "auto_inbox": "auto", "logs": "logs"}
            def json(self, *_): return {"ids": [], "imageSha256": []}
            def children(self, folder): return [{"id": "app-json", "name": "opaque-name.json"}] if folder == owner.folder else []
            def read(self, file_id, *_): return owner.image if file_id == "image-file" else encoded(owner.files[file_id])
            def put_json(self, folder, name, record, **kwargs):
                assert folder == owner.folder and name == "opaque-name.json" and kwargs == {"replace": True}
                owner.files["app-json"] = copy.deepcopy(record)

        self.patcher = patch("launcher.DriveStore", FakeDrive)
        self.patcher.start()
        launcher.PROCESS = launcher.REVIEW = None
        self.labels = [pair[0] for pair in json.loads((launcher.HERE.parents[2] / "lib/food-ai/test-photo-labels.json").read_text())]

    def tearDown(self):
        self.patcher.stop()
        launcher.PROCESS = launcher.REVIEW = None

    def test_custom_submission_is_reviewable_but_cannot_be_trained_unreviewed(self):
        with self.assertRaises(ValueError): validate_record(self.record, self.labels)
        result = launcher.next_review()
        self.assertEqual(result["id"], self.record["id"])
        self.assertEqual(result["hash"], self.record["imageSha256"])
        self.assertNotIn("custom:海鮮丼", dict(result["labels"]))
        self.assertNotIn("confirmedFoodName", result)  # independent visual review, no suggested answer
        with self.assertRaises(ValueError):
            launcher.save_review({"id": result["id"], "hash": result["hash"], "foodId": "custom:海鮮丼", "decision": "accepted"})

    def test_reviewed_known_label_preserves_original_answer_and_receipt_fingerprint(self):
        # Exercise a synthetic independent correction, not a verdict on the real
        # user's seafood-bowl photo: out-of-catalog foods must never be forced in.
        result = launcher.next_review()
        launcher.save_review({"id": result["id"], "hash": result["hash"], "foodId": "rice", "decision": "accepted"})
        record = self.files["app-json"]
        self.assertEqual(record["submittedFoodId"], "custom:海鮮丼")
        self.assertEqual(record["submittedFoodName"], "海鮮丼")
        names = {food["id"]: food["name"] for food in json.loads((launcher.HERE.parents[2] / "lib/data/food-library.json").read_text())["foods"]}
        self.assertEqual(record["confirmedFoodName"], names["rice"])
        self.assertEqual(record["requestFingerprint"], self.record["requestFingerprint"])
        self.assertEqual(record["consent"], self.record["consent"])
        self.assertEqual(record["source"], "app_user_corrected")
        validate_record(record, self.labels)
        self.assertTrue(launcher.next_review()["empty"])

    def test_invalid_consent_is_not_exposed_for_review(self):
        for replacement in [{"granted": True}, {**self.record["consent"], "purpose": "other"},
            {**self.record["consent"], "at": "not-a-date"}, {**self.record["consent"], "granted": False}]:
            self.files["app-json"]["consent"] = replacement
            self.assertTrue(launcher.next_review()["empty"])
            self.assertIsNone(launcher.REVIEW)

    def test_public_candidate_without_display_name_remains_reviewable(self):
        self.folder = "auto"
        record = self.files["app-json"]
        record["source"] = "autonomous_public"
        del record["confirmedFoodName"]
        result = launcher.next_review()
        launcher.save_review({"id": result["id"], "hash": result["hash"], "foodId": "rice", "decision": "accepted"})
        self.assertEqual(self.files["app-json"]["confirmedFoodId"], "rice")
        self.assertNotIn("submittedFoodName", self.files["app-json"])

    def test_review_rejects_changes_and_keeps_out_of_catalog_food_excluded(self):
        result = launcher.next_review()
        self.files["app-json"]["consent"]["granted"] = False
        with self.assertRaises(ValueError):
            launcher.save_review({"id": result["id"], "hash": result["hash"], "foodId": "rice", "decision": "accepted"})
        self.files["app-json"] = copy.deepcopy(self.record)
        result = launcher.next_review()
        launcher.save_review({"id": result["id"], "hash": result["hash"], "foodId": "", "decision": "rejected"})
        with self.assertRaises(ValueError): validate_record(self.files["app-json"], self.labels)
        self.assertEqual(self.files["app-json"]["confirmedFoodName"], "海鮮丼")


if __name__ == "__main__":
    unittest.main()
