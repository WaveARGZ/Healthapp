"""RAM-only review checks: no authentication, Drive writes or local learning files."""
import copy
import io
import socket
import unittest
from unittest.mock import patch

from PIL import Image

import feedback_review as feedback
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
            "source": "app_user_corrected", "confirmedFoodId": "rice", "confirmedFoodName": "白ごはん",
            "predictedFoodIds": ["chicken-breast"], "review": {"status": "pending"},
            "nutritionProvenance": "user_estimate", "nutrition": {"calories": 0},
            "createdAt": "2026-10-21T01:00:00Z",
            "consent": {"granted": True, "version": "food-photo-training-v2", "purpose": "food-recognition", "at": "2026-10-21T01:00:00Z"},
        }
        self.files = {"app-json": copy.deepcopy(self.record)}
        self.folder, self.version, self.image_version = "app", "1", "1"
        self.snapshots, self.writes, self.exclusions = [], [], []
        self.revocations = {"ids": [], "imageSha256": []}
        self.after_snapshot = None
        self.bad_image_parent = False
        owner = self

        class FakeDrive:
            def layout(self, create=False):
                assert create is False
                return {"app_inbox": "app", "auto_inbox": "auto", "logs": "logs"}
            def json(self, *_): return copy.deepcopy(owner.revocations)
            def children(self, folder): return [{"id": "app-json", "name": "opaque-name.json"}] if folder == owner.folder else []
            def find(self, folder, name):
                assert folder == owner.folder and name == "opaque-name.json"
                return {"id": "app-json"}
            def meta(self, file_id):
                image = file_id == "image-file"
                return {"id": file_id, "name": "image.jpg" if image else "opaque-name.json",
                    "version": owner.image_version if image else owner.version, "trashed": False,
                    "parents": ["unexpected" if image and owner.bad_image_parent else owner.folder],
                    "permissions": [{"type": "user", "role": "owner"}]}
            def read(self, file_id, limit):
                data = owner.image if file_id == "image-file" else encoded(owner.files[file_id])
                assert len(data) <= limit
                return data
            def put(self, folder, name, raw, mime):
                assert folder == "logs" and name.startswith("review-input-") and mime == "application/json"
                owner.snapshots.append(raw)
                if owner.after_snapshot: owner.after_snapshot()
                return "snapshot-file"
            def put_json(self, folder, name, record, **kwargs):
                assert folder == owner.folder and name == "opaque-name.json" and kwargs == {"replace": True}
                owner.writes.append(copy.deepcopy(record))
                owner.files["app-json"] = copy.deepcopy(record)
                owner.version = str(int(owner.version) + 1)
                return "app-json"

        self.addCleanup(patch.stopall)
        patch("feedback_review.DriveStore", FakeDrive).start()
        patch("feedback_review.owner_exclusions", side_effect=lambda: self.exclusions).start()
        launcher.PROCESS = launcher.REVIEW = None
        self.labels = list(feedback.catalog()[0])

    def tearDown(self):
        launcher.PROCESS = launcher.REVIEW = None

    def verdict(self, result, food_id="rice", decision="accepted"):
        return {"id": result["id"], "hash": result["hash"], "foodId": food_id, "decision": decision}

    def test_unreviewed_is_excluded_and_original_answer_hidden(self):
        with self.assertRaises(ValueError): validate_record(self.record, self.labels)
        result = launcher.next_review()
        self.assertEqual(result["id"], self.record["id"])
        self.assertNotIn("confirmedFoodName", result)
        self.assertNotIn("predictedFoodIds", result)

    def test_human_review_preserves_source_consent_nutrition_and_previous_review(self):
        result = launcher.next_review()
        launcher.save_review(self.verdict(result))
        saved = self.files["app-json"]
        for key, value in self.record.items():
            if key != "review": self.assertEqual(saved[key], value, key)
        self.assertEqual(saved["reviewHistory"], [self.record["review"]])
        self.assertEqual(saved["review"]["method"], "human")
        self.assertEqual(saved["review"]["inputRecordSha256"], sha(encoded(self.record)))
        self.assertEqual(saved["review"]["inputSnapshotFileId"], "snapshot-file")
        self.assertEqual(self.snapshots, [encoded(self.record)])
        validate_record(saved, self.labels)
        self.assertTrue(launcher.next_review()["empty"])
        self.assertIsNone(launcher.REVIEW)

    def test_codex_uses_visual_agent_and_requires_notes(self):
        result, ticket = feedback.open_next_review()
        options = {**self.verdict(result), "notes": "Inspected the synthetic in-memory test image.", "method": "human", "reviewer": "owner"}
        feedback.commit_review(ticket, options, actor="codex")
        saved = self.files["app-json"]["review"]
        self.assertEqual((saved["method"], saved["reviewer"]), ("visual-agent", "Codex"))
        with self.assertRaises(ValueError): feedback.commit_review(ticket, self.verdict(result), actor="codex")

    def test_custom_food_stays_pending_without_forced_class(self):
        self.files["app-json"].update(confirmedFoodId="custom:海鮮丼", confirmedFoodName="海鮮丼")
        result = launcher.next_review()
        self.assertTrue(result["empty"])
        self.assertEqual(result["outsideCatalogPending"], 1)
        self.assertEqual(self.files["app-json"]["review"], {"status": "pending"})
        self.assertEqual(self.writes, [])

    def test_mismatched_app_label_cannot_be_accepted(self):
        result = launcher.next_review()
        with self.assertRaises(ValueError): launcher.save_review(self.verdict(result, "chicken-breast"))
        self.assertEqual(self.writes + self.snapshots, [])

    def test_invalid_consent_and_exclusions_are_not_displayed(self):
        for replacement in [{"granted": True}, {**self.record["consent"], "purpose": "other"},
            {**self.record["consent"], "at": "not-a-date"}, {**self.record["consent"], "granted": False}]:
            self.files["app-json"]["consent"] = replacement
            self.assertTrue(launcher.next_review()["empty"])
        self.files["app-json"] = copy.deepcopy(self.record)
        self.exclusions.append({"id": self.record["id"], "imageSha256": self.record["imageSha256"]})
        self.assertTrue(launcher.next_review()["empty"])

    def test_consent_revoked_after_display_prevents_all_writes(self):
        result = launcher.next_review()
        self.revocations["ids"].append(result["id"])
        with self.assertRaises(ValueError): launcher.save_review(self.verdict(result))
        self.assertEqual(self.writes + self.snapshots, [])

    def test_revocation_after_snapshot_prevents_record_update(self):
        result = launcher.next_review()
        self.after_snapshot = lambda: self.revocations["imageSha256"].append(result["hash"])
        with self.assertRaises(ValueError): launcher.save_review(self.verdict(result))
        self.assertEqual(len(self.snapshots), 1)
        self.assertEqual(self.writes, [])

    def test_record_version_or_content_changes_prevent_overwrite(self):
        for change in (lambda: setattr(self, "version", "2"), lambda: self.files["app-json"].update(nutrition={"calories": 100})):
            self.version, self.files["app-json"] = "1", copy.deepcopy(self.record)
            result = launcher.next_review()
            change()
            with self.assertRaises(ValueError): launcher.save_review(self.verdict(result))
        self.assertEqual(self.writes + self.snapshots, [])

    def test_image_change_or_wrong_parent_prevents_write(self):
        result = launcher.next_review()
        self.image_version = "2"
        with self.assertRaises(ValueError): launcher.save_review(self.verdict(result))
        self.image_version, self.bad_image_parent = "1", True
        with self.assertRaises(ValueError): launcher.save_review(self.verdict(result))
        self.assertEqual(self.writes + self.snapshots, [])

    def test_snapshot_failure_leaves_original_pending(self):
        result = launcher.next_review()
        with patch.object(feedback.DriveStore, "put", side_effect=RuntimeError("Drive readback SHA-256 mismatch")):
            with self.assertRaises(RuntimeError): launcher.save_review(self.verdict(result))
        self.assertEqual(self.files["app-json"], self.record)
        self.assertEqual(self.writes, [])

    def test_rejected_record_keeps_answer_and_is_not_trainable(self):
        result = launcher.next_review()
        launcher.save_review(self.verdict(result, "", "rejected"))
        self.assertEqual(self.files["app-json"]["confirmedFoodName"], self.record["confirmedFoodName"])
        with self.assertRaises(ValueError): validate_record(self.files["app-json"], self.labels)

    def test_public_candidate_requires_valid_commercial_rights(self):
        self.folder = "auto"
        record = self.files["app-json"]
        record["source"] = "autonomous_public"
        record.pop("confirmedFoodName")
        result = launcher.next_review()
        with self.assertRaises(ValueError): launcher.save_review(self.verdict(result))
        self.assertEqual(self.writes + self.snapshots, [])
        record["provenance"] = {"license": "CC BY 4.0", "pageUrl": "https://example.invalid/photo", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/", "attribution": "Synthetic test author"}
        result = launcher.next_review()
        launcher.save_review(self.verdict(result))
        validate_record(self.files["app-json"], self.labels)

    def test_bind_only_mutex_blocks_review_without_listening(self):
        with socket.socket() as lock:
            lock.bind(("127.0.0.1", 3003))
            with self.assertRaises(OSError): launcher.next_review()
        self.assertEqual(self.writes + self.snapshots, [])

    def test_owner_state_required_before_authentication(self):
        with patch("feedback_review.owner_exclusions", side_effect=RuntimeError("owner_learning_state_missing")), patch("feedback_review.DriveStore") as drive:
            with self.assertRaises(RuntimeError): feedback.open_next_review()
            drive.assert_not_called()


if __name__ == "__main__":
    unittest.main()
