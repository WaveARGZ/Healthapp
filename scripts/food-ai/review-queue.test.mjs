import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileHash } from "./agent-utils.mjs";
import { buildReviewQueue, completedReview, loadReviewRecords, prioritizePending } from "./review-queue.mjs";
import { recordReviews } from "./record-review.mjs";

async function fixture(t, ids = ["sample-a"]) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "bodymake-review-test-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const { RawImage } = await import("@huggingface/transformers");
  const png = await new RawImage(new Uint8Array([255, 120, 20]), 1, 1, 3).toSharp().png().toBuffer();
  for (const id of ids) {
    await writeFile(path.join(dataDir, `${id}.png`), png);
    await writeFile(path.join(dataDir, `${id}.json`), JSON.stringify({ schemaVersion: 1, id, labelVerified: false,
      confirmedFoodId: "ramen", confirmedFoodName: "仮ラベル", labelOrigin: "test fixture" }));
  }
  return { dataDir, hash: await fileHash(path.join(dataDir, `${ids[0]}.png`)) };
}

test("queue balances scarce classes and skips only unchanged completed reviews", () => {
  const hash = "a".repeat(64);
  const review = { method: "visual-agent", reviewer: "test", reviewedAt: "2026-10-09T00:00:00Z", imageSha256: hash, decision: "accepted" };
  const rows = [
    { id: "known", imageSha256: hash, metadata: { confirmedFoodId: "pizza", labelVerified: true, review } },
    { id: "no", imageSha256: hash, metadata: { confirmedFoodId: "salad", labelVerified: false, review: { ...review, decision: "rejected" } } },
    ...["pizza", "pizza", "salad", "salad"].map((label, i) => ({ id: `pending-${i}`, imageSha256: hash, metadata: { confirmedFoodId: label } })),
    { id: "changed", imageSha256: "b".repeat(64), metadata: { confirmedFoodId: "pizza", labelVerified: true, review } },
  ];
  const result = prioritizePending(rows, new Map([["pizza", "ピザ"], ["salad", "サラダ"]]));
  assert.equal(result.skippedReviewedCount, 2);
  assert.deepEqual(result.pending.slice(0, 4).map((x) => x.metadata.confirmedFoodId), ["salad", "pizza", "salad", "pizza"]);
  assert.ok(result.pending.some((x) => x.id === "changed"));
});

test("queue produces a contact sheet without changing or confirming metadata", async (t) => {
  const { dataDir, hash } = await fixture(t);
  const original = await readFile(path.join(dataDir, "sample-a.json"), "utf8");
  const queue = await buildReviewQueue({ dataDir, outputDir: path.join(dataDir, "queue"), limit: 1 });
  assert.equal(queue.items.length, 1);
  assert.equal(queue.items[0].imageSha256, hash);
  assert.ok(path.isAbsolute(queue.items[0].imagePath));
  assert.equal(queue.sheets.length, 1);
  assert.ok((await readFile(queue.sheets[0])).byteLength > 100);
  assert.equal(await readFile(path.join(dataDir, "sample-a.json"), "utf8"), original);
});

test("recorder maps corrected labels to Japanese and retains explicit rejections", async (t) => {
  const { dataDir, hash } = await fixture(t, ["sample-a", "sample-b"]);
  const result = await recordReviews({ dataDir, reviewer: "Test visual agent", decisions: [
    { id: "sample-a", imageSha256: hash, foodId: "sushi", notes: "Fixture only, not a real food review." },
    { id: "sample-b", imageSha256: hash, foodId: null, notes: "Not a food photograph." },
  ] });
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 1);
  const a = JSON.parse(await readFile(path.join(dataDir, "sample-a.json")));
  const b = JSON.parse(await readFile(path.join(dataDir, "sample-b.json")));
  assert.equal(a.confirmedFoodId, "sushi");
  assert.equal(a.confirmedFoodName, "寿司（種類未指定）");
  assert.equal(a.labelOrigin, "test fixture");
  assert.equal(a.review.method, "visual-agent");
  assert.equal(completedReview(a, hash), "accepted");
  assert.equal(completedReview(b, hash), "rejected");
  const queue = await buildReviewQueue({ dataDir, outputDir: path.join(dataDir, "queue"), limit: 2 });
  assert.equal(queue.items.length, 0);
  assert.equal(queue.skippedReviewedCount, 2);
});

test("recorder refuses stale hashes, traversal IDs, duplicates and unknown labels before any writes", async (t) => {
  const { dataDir, hash } = await fixture(t);
  const original = await readFile(path.join(dataDir, "sample-a.json"), "utf8");
  const valid = { id: "sample-a", imageSha256: hash, foodId: "sushi", notes: "Fixture." };
  const invalidBatches = [
    [{ ...valid, imageSha256: "f".repeat(64) }], [valid, { ...valid, id: "../outside" }],
    [valid, { ...valid, foodId: "pizza" }], [{ ...valid, foodId: "unknown" }],
  ];
  for (const decisions of invalidBatches) {
    await assert.rejects(recordReviews({ dataDir, reviewer: "Test", decisions }));
    assert.equal(await readFile(path.join(dataDir, "sample-a.json"), "utf8"), original);
  }
});

test("symlink images cannot redirect dataset reviews outside the directory", async (t) => {
  const { dataDir } = await fixture(t);
  await writeFile(path.join(dataDir, "linked.json"), JSON.stringify({ schemaVersion: 1, id: "linked", confirmedFoodId: "ramen" }));
  await symlink(path.join(dataDir, "sample-a.png"), path.join(dataDir, "linked.png"));
  const result = await loadReviewRecords(dataDir);
  assert.deepEqual(result.records.map((x) => x.id), ["sample-a"]);
  assert.ok(result.issues.some((x) => x.file === "linked.png"));
});
