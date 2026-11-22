"""Consented, independently reviewed app feedback -> bounded feature pipeline, in RAM."""
import copy
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from PIL import Image

from drive_store import LAYOUT, encoded, sha
from hybrid import CONTRACT, unpack_cache
import pipeline


class FeedbackPipelineTests(unittest.TestCase):
    def test_reviewed_feedback_recomputes_all_scores_reuses_cache_and_keeps_model_gates(self):
        output = io.BytesIO()
        Image.new("RGB", (80, 80), "green").save(output, "JPEG")
        image = output.getvalue()
        labels = json.loads((Path(__file__).resolve().parents[3] / "lib/food-ai/test-photo-labels.json").read_text())
        record = {"id": "mock-consented-feedback", "source": "app_user_corrected", "confirmedFoodId": "rice",
            "imageSha256": sha(image), "imageFileId": "image", "nutrition": {"calories": 0},
            "predictedFoodIds": [],  # An incomplete app guess must never stand in for the full score vector.
            "consent": {"granted": True, "version": "food-photo-training-v2", "purpose": "food-recognition", "at": "2026-11-22T00:00:00Z"},
            "review": {"decision": "accepted", "imageSha256": sha(image), "foodId": "rice", "reviewer": "Codex",
                "method": "visual-agent", "reviewedAt": "2026-11-22T00:00:00Z"}}

        class FakeDrive:
            def __init__(self): self.saved = {}
            def capacity(self, _): pass
            def layout(self, create=False): return {key: key for key in LAYOUT}
            def children(self, parent): return [{"id": "record", "name": "feedback.json", "version": "1"}] if parent == "app_inbox" else []
            def guard(self, _): return {"parents": ["app_inbox"], "version": "1"}
            def find(self, parent, name): return {"id": (parent, name)} if (parent, name) in self.saved else None
            def json(self, parent, name, default=None): return self.saved.get((parent, name), default)
            def read(self, file_id, limit=None):
                if file_id == "record": return encoded(record)
                return image if file_id == "image" else self.saved[file_id]
            def put(self, parent, name, raw, *_, **kwargs): self.saved[(parent, name)] = raw; return (parent, name)
            def put_json(self, parent, name, value, **kwargs): self.saved[(parent, name)] = copy.deepcopy(value); return (parent, name)

        class FakeFeatures:
            calls = 0
            def __init__(self, *_): pass
            def extract(self, raw, prompts):
                self.__class__.calls += 1
                assert len(prompts) == 28 and CONTRACT["featureSize"] == 512
                return {"embedding": [1.] + [0.] * 511, "scores": [1 / 28] * 28}
            def close(self): pass

        def local(relative, fallback=None):
            return {"lib/food-ai/test-photo-labels.json": labels,
                "lib/data/food-library.json": {"foods": []}}.get(relative, fallback)

        drive = FakeDrive()
        options = SimpleNamespace(preflight=False, collect=False, import_existing=False)
        with patch("pipeline.require_owner_learning_state"), patch("pipeline.local_json", local), patch("pipeline.archived_records", return_value=[]), patch("pipeline.Features", FakeFeatures), patch("pipeline.fit") as fit, patch("sys.stdout", io.StringIO()):
            pipeline.run(options, drive)
            self.assertEqual(FakeFeatures.calls, 1)
            registry = copy.deepcopy(drive.saved[("cache", "split-registry.json")])
            pipeline.run(options, drive)
            self.assertEqual(FakeFeatures.calls, 1, "already saved full features must not be recomputed")
            self.assertEqual(drive.saved[("cache", "split-registry.json")], registry)
            fit.assert_not_called()  # One reviewed picture cannot satisfy independent evaluation or coverage.
        self.assertEqual(drive.saved[("logs", "status.json")]["stage"], "not_adopted")
        self.assertNotIn(("candidates", "active-test.json"), drive.saved)
        fingerprint = sha(encoded({"contract": CONTRACT, "labels": labels}))
        cache = unpack_cache(drive.saved[("cache", "embeddings-" + fingerprint[:16] + ".npz")], fingerprint)
        self.assertEqual(len(cache), 1)
        self.assertEqual((len(cache[0]["embedding"]), len(cache[0]["scores"])), (512, 28))
        self.assertEqual(cache[0]["source"], "app_user_corrected")


if __name__ == "__main__":
    unittest.main()
