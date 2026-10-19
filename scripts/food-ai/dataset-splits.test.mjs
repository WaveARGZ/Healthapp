import assert from "node:assert/strict";
import test from "node:test";
import { digest, hasIndependentReview, planDatasetSplits } from "./dataset-splits.mjs";

const emptyRegistry = () => ({ schemaVersion: 1, id: "test-registry", assignments: {} });
function sample(id, overrides = {}) {
  return { id, hash: digest(id), dhash: digest(`perceptual:${id}`).slice(0, 16), label: "rice", verified: true, ...overrides };
}
const records = Array.from({ length: 20 }, (_, index) => sample(`image-${index}`));

test("写真を追加しても過去の学習・検証・テスト分割は変わらない", () => {
  const first = planDatasetSplits(records, emptyRegistry());
  const additional = Array.from({ length: 20 }, (_, index) => sample(`new-${index}`));
  const second = planDatasetSplits([...additional, ...records].reverse(), first.registry);
  for (const item of records) assert.equal(second.registry.assignments[item.hash].split, first.registry.assignments[item.hash].split);
  const third = planDatasetSplits([...additional, ...records], second.registry);
  assert.equal(second.datasetFingerprint, third.datasetFingerprint);
  assert.notEqual(first.datasetFingerprint, second.datasetFingerprint);
});

test("削除済み学習画像の近似コピーも元の学習分割を維持", () => {
  const first = planDatasetSplits(records, emptyRegistry());
  const oldTraining = first.splits.train[0];
  const copy = sample("new-copy", { dhash: oldTraining.dhash });
  const second = planDatasetSplits([...records.filter((item) => item.hash !== oldTraining.hash), copy], first.registry);
  assert.equal(second.registry.assignments[copy.hash].split, "train");
  assert.equal(second.splits.test.some((item) => item.hash === copy.hash), false);
});

test("過去の異なる分割をつなぐ近似画像はグループごと隔離", () => {
  const a = sample("old-training", { dhash: "0000000000000000" });
  const b = sample("old-test", { dhash: "00000000000000ff" });
  const bridge = sample("bridge", { dhash: "000000000000000f" });
  const registry = emptyRegistry();
  registry.assignments[a.hash] = { split: "train", label: "rice", dhash: a.dhash };
  registry.assignments[b.hash] = { split: "test", label: "rice", dhash: b.dhash };
  const result = planDatasetSplits([...records, a, b, bridge], registry);
  const retained = Object.values(result.splits).flat().map((item) => item.hash);
  for (const item of [a, b, bridge]) assert.equal(retained.includes(item.hash), false);
  assert.equal(result.review.filter((item) => /異なる分割/.test(item.reason)).length, 3);
  assert.equal(result.registry.assignments[a.hash].split, "train");
});

test("未確認画像は本学習から除外し、仮ラベル実験でも既知の誤ラベルを使わない", () => {
  const weak = records.map((item) => ({ ...item, verified: false }));
  assert.equal(Object.values(planDatasetSplits(weak, emptyRegistry()).splits).flat().length, 0);
  assert.equal(Object.values(planDatasetSplits(weak, emptyRegistry(), { allowUnreviewed: true }).splits).flat().length, 20);
  const rejected = weak.map((item) => ({ ...item, review: { decision: "rejected" } }));
  assert.equal(Object.values(planDatasetSplits(rejected, emptyRegistry(), { allowUnreviewed: true }).splits).flat().length, 0);
});

test("画像ハッシュ・独立した確認方法・日時がそろう正解だけ検証済み", () => {
  const hash = digest("photo");
  const record = { labelVerified: true, review: { method: "visual-agent", reviewer: "image-reviewer", reviewedAt: "2026-10-09T00:00:00Z", imageSha256: hash } };
  assert.equal(hasIndependentReview(record, hash), true);
  assert.equal(hasIndependentReview({ ...record, review: { ...record.review, method: "human" } }, hash), true);
  assert.equal(hasIndependentReview({ labelVerified: true }, hash), false);
  assert.equal(hasIndependentReview({ ...record, labelVerified: undefined }, hash), false);
  assert.equal(hasIndependentReview(record, digest("other photo")), false);
  assert.equal(hasIndependentReview({ ...record, review: { ...record.review, method: "clip-prediction" } }, hash), false);
  assert.equal(hasIndependentReview({ ...record, review: { ...record.review, decision: "rejected" } }, hash), false);
  assert.equal(hasIndependentReview({ ...record, review: { ...record.review, decision: "pending" } }, hash), false);
  assert.equal(hasIndependentReview({ ...record, confirmedFoodId: "rice", review: { ...record.review, foodId: "fish" } }, hash), false);
});

test("過去の台帳とラベルが違う写真や破損台帳は黙って再分割しない", () => {
  const first = planDatasetSplits(records, emptyRegistry());
  const wrong = records.map((item, index) => index === 0 ? { ...item, label: "fish" } : item);
  const second = planDatasetSplits(wrong, first.registry);
  assert.ok(second.review.some((item) => item.id === records[0].id && /矛盾/.test(item.reason)));
  assert.throws(() => planDatasetSplits(records, { schemaVersion: 0 }), /台帳/);
});
