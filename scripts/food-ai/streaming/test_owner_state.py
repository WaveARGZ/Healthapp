"""Source-only clone protection, using RAM-only filesystem and Drive doubles."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pipeline


class MemoryPath:
    def __init__(self, entries, name=""):
        self.entries, self.name = entries, name

    def __truediv__(self, child):
        return MemoryPath(self.entries, "/".join(part for part in (self.name, child) if part))

    def is_symlink(self):
        return self.entries.get(self.name) == "symlink"

    def is_file(self):
        return isinstance(self.entries.get(self.name), int)

    def stat(self):
        return SimpleNamespace(st_size=self.entries[self.name])

    def glob(self, pattern):
        assert pattern == "commons-*.json"
        prefix = self.name + "/commons-"
        return (MemoryPath(self.entries, name) for name in self.entries
            if name.startswith(prefix) and name.endswith(".json"))


class OwnerStateTests(unittest.TestCase):
    def state(self):
        return {**dict.fromkeys(pipeline.OWNER_STATE_FILES, 10),
            "training-data/commons/commons-42.json": 10}

    def test_missing_each_required_ledger_blocks_before_drive_authentication(self):
        for missing in pipeline.OWNER_STATE_FILES:
            with self.subTest(missing=missing):
                entries = self.state()
                entries.pop(missing)
                with patch("pipeline.REPO", MemoryPath(entries)), patch("pipeline.DriveStore") as connect:
                    with self.assertRaises(pipeline.OwnerLearningStateMissing):
                        pipeline.run(SimpleNamespace(preflight=False))
                    connect.assert_not_called()

    def test_fresh_clone_preflight_is_read_only_and_does_not_report_ready(self):
        drive = Mock()
        with patch("pipeline.REPO", MemoryPath({})), patch("pipeline.DriveStore") as connect:
            with self.assertRaises(pipeline.OwnerLearningStateMissing):
                pipeline.run(SimpleNamespace(preflight=True), drive)
            connect.assert_not_called()
        self.assertEqual(drive.mock_calls, [])

    def test_empty_or_linked_ledgers_and_missing_review_records_are_rejected(self):
        for replacement in (0, "symlink"):
            entries = self.state()
            entries[pipeline.OWNER_STATE_FILES[0]] = replacement
            with patch("pipeline.REPO", MemoryPath(entries)):
                with self.assertRaises(pipeline.OwnerLearningStateMissing):
                    pipeline.require_owner_learning_state()
        for record in (None, 0, "symlink"):
            entries = self.state()
            if record is None:
                entries.pop("training-data/commons/commons-42.json")
            else:
                entries["training-data/commons/commons-42.json"] = record
            with patch("pipeline.REPO", MemoryPath(entries)):
                with self.assertRaises(pipeline.OwnerLearningStateMissing):
                    pipeline.require_owner_learning_state()

    def test_existing_regular_evidence_passes_without_reading_or_writing_contents(self):
        with patch("pipeline.REPO", MemoryPath(self.state())):
            pipeline.require_owner_learning_state()

    def test_diagnostic_is_actionable_and_does_not_expose_exception_contents(self):
        status = pipeline.failure_status(pipeline.OwnerLearningStateMissing("private-token"))
        self.assertEqual(status["diagnosticCode"], "owner_learning_state_missing")
        self.assertEqual(status["stage"], "blocked")
        self.assertFalse(status["retryable"])
        self.assertNotIn("private-token", json.dumps(status))


if __name__ == "__main__":
    unittest.main()
