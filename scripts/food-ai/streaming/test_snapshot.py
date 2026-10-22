import unittest

from pipeline import code_snapshot


class SourceSnapshotTests(unittest.TestCase):
    def test_source_snapshot_includes_receiver_client_contracts_without_secrets_or_data(self):
        snapshot = code_snapshot("test", {"adopted": False})
        names = snapshot["files"]
        self.assertIn("scripts/google-drive-training-ingest/Code.gs", names)
        self.assertIn("components/meals/public-food-photo.tsx", names)
        self.assertIn("lib/food-ai/clip-features.mjs", names)
        self.assertIn("hooks/use-google-drive-client-id.ts", names)
        self.assertIn("scripts/food-ai/streaming/pipeline.py", names)
        self.assertTrue(all(not name.startswith(("training-data/", "ml/", ".")) and ".env" not in name for name in names))
