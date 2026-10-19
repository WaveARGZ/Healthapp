import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { collectNutrition5k, SOURCE } from "./collect-nutrition5k.mjs";
import { DEFAULT_DRIVE_FOLDER, DRIVE_BUDGET_BYTES } from "./drive-archive.mjs";
import { assertArchivedImage, loadNutritionCache, offloadNutrition5k, verifiedNutritionProofs } from "./nutrition5k-cache.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const dishId = "dish_1556572657";
const imageFile = `images/nutrition5k-${dishId}.png`;
const recordFile = `records/nutrition5k-${dishId}.json`;
const save = async (file, value) => writeFile(file, JSON.stringify(value));

async function fixture() {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "bodymake-nutrition5k-cache-")));
  const dataDir = path.join(directory, "data"); const archiveDir = path.join(directory, "archive");
  await mkdir(archiveDir);
  const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "red" } }).png().toBuffer();
  const fetchImpl = async (url) => {
    if (url.includes("/storage/v1/")) return Response.json({ items: [{ name: `nutrition5k_dataset/imagery/realsense_overhead/${dishId}/rgb.png`, size: String(image.length) }] });
    if (url.endsWith("cafe1.csv")) return new Response(`${dishId},100,200,1,20,5,ingr_0000000026,white rice,200,100,1,20,5\n`);
    if (url.endsWith("cafe2.csv")) return new Response("");
    if (url.endsWith("ingredients_metadata.csv")) return new Response("ingredients");
    if (url.endsWith("train_ids.txt")) return new Response(dishId);
    if (url.endsWith("test_ids.txt")) return new Response("");
    if (url.endsWith("rgb.png")) return new Response(image);
    throw new Error("Unexpected network");
  };
  const options = { output: dataDir, archiveDir, maxNew: 1, maxBytes: 1_000_000_000 };
  const deps = { fetchImpl, wait: async () => {}, freeBytes: async () => 10_000_000_000 };
  await collectNutrition5k(options, deps);
  const record = JSON.parse(await readFile(path.join(dataDir, recordFile)));
  const recordBytes = await readFile(path.join(dataDir, recordFile));
  const id = "batch-00000001-0123456789abcdef"; const remoteId = "verified-nutrition5k-remote-file";
  const batch = { id, dataset: "nutrition5k", dataDir, status: "uploaded", bytes: 10000, sha256: "a".repeat(64), md5: "b".repeat(32), files: [
    { key: `nutrition5k/${imageFile}`, source: imageFile, bytes: image.length, sha256: hash(image) },
    { key: `nutrition5k/${recordFile}`, source: recordFile, bytes: recordBytes.length, sha256: hash(recordBytes) },
  ] };
  batch.receipt = { batchId: id, remoteId, folderId: DEFAULT_DRIVE_FOLDER, name: `${id}.tar`, size: batch.bytes, verificationMethod: "download-sha256", verifiedBy: "drive-connector", verifiedAt: new Date().toISOString(), recordedAt: new Date().toISOString(), remoteMetadata: { id: remoteId, title: `${id}.tar`, mime_type: "application/x-tar", size: String(batch.bytes), shared: false, parent_ids: [DEFAULT_DRIVE_FOLDER] }, downloadVerification: { bytes: batch.bytes, sha256: batch.sha256, md5: batch.md5, checkedAt: new Date().toISOString() } };
  const state = { schemaVersion: 1, folderId: DEFAULT_DRIVE_FOLDER, budgetBytes: DRIVE_BUDGET_BYTES, batches: [batch] };
  const ledger = path.join(archiveDir, "state.json"); await save(ledger, state);
  return { directory, dataDir, archiveDir, image, record, state, ledger, options, deps };
}

test("Nutrition5kの退避は既定dry-run、全再取得証明後だけ削除し、収集で再取得しない", async () => {
  const f = await fixture();
  try {
    const beforeManifest = await readFile(path.join(f.dataDir, "archive-source.json"));
    const dry = await offloadNutrition5k(f);
    assert.equal(dry.dryRun, true); assert.equal(dry.eligible, 1); assert.equal(dry.deleted, 0);
    await access(path.join(f.dataDir, imageFile));
    await assert.rejects(access(path.join(f.dataDir, "archive-cache-index.json")), { code: "ENOENT" });
    assert.deepEqual(await readFile(path.join(f.dataDir, "archive-source.json")), beforeManifest);
    const applied = await offloadNutrition5k({ ...f, apply: true });
    assert.equal(applied.deleted, 1); assert.equal(applied.deletedBytes, f.image.length);
    await assert.rejects(access(path.join(f.dataDir, imageFile)), { code: "ENOENT" });
    await access(path.join(f.dataDir, recordFile)); await access(path.join(f.dataDir, "metadata/dish_metadata_cafe1.csv"));
    const index = JSON.parse(await readFile(path.join(f.dataDir, "archive-cache-index.json")));
    assert.equal(index.entries[0].remoteId, f.state.batches[0].receipt.remoteId);
    assert.equal(index.entries[0].archiveObjectPath, `objects/${hash(f.image)}`); assert.equal(index.entries[0].status, "evicted");
    const cache = await loadNutritionCache(f.dataDir, { archiveDir: f.archiveDir });
    assert.equal(assertArchivedImage(f.record, cache).sha256, hash(f.image));
    const continued = await collectNutrition5k(f.options, { ...f.deps, fetchImpl: async () => { throw new Error("Must not redownload"); } });
    assert.equal(continued.added, 0); assert.equal(continued.total, 1); assert.equal(continued.archivedImages, 1); assert.equal(continued.downloadedBytes, 0);
    const manifest = JSON.parse(await readFile(path.join(f.dataDir, "archive-source.json")));
    assert.ok(!manifest.files.includes(imageFile)); assert.ok(manifest.files.includes(recordFile)); assert.ok(manifest.files.includes("archive-cache-index.json")); assert.equal(manifest.publicSource.url, SOURCE.url);
    const repeated = await offloadNutrition5k({ ...f, apply: true });
    assert.equal(repeated.deleted, 0); assert.equal(repeated.alreadyEvicted, 1);
    // Restore is also supported; an eviction-history entry is not a delete instruction.
    await writeFile(path.join(f.dataDir, imageFile), f.image);
    const restored = await collectNutrition5k(f.options, { ...f.deps, fetchImpl: async () => { throw new Error("Must not redownload"); } });
    assert.equal(restored.archivedImages, 0); assert.equal(restored.total, 1);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("uploaded以外・MD5のみ・画像だけで正解未保管の場合は退避しない", async () => {
  const f = await fixture();
  try {
    const original = structuredClone(f.state);
    for (const mutate of [
      (state) => { state.batches[0].status = "ready"; },
      (state) => { state.batches[0].receipt.verificationMethod = "drive-md5"; },
      (state) => { state.batches[0].files.pop(); },
      (state) => { state.batches[0].dataset = "commons"; },
      (state) => { state.batches[0].dataDir += "-different"; },
    ]) {
      const state = structuredClone(original); mutate(state); await save(f.ledger, state);
      const result = await offloadNutrition5k({ ...f, apply: true });
      assert.equal(result.deleted, 0); assert.equal(result.eligible, 0); assert.equal(result.skipped.length, 1);
      await access(path.join(f.dataDir, imageFile));
    }
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("退避はフォルダ・再取得ハッシュ・共有状態・ローカル改変をfail closedで検証", async () => {
  const f = await fixture();
  try {
    const original = structuredClone(f.state);
    for (const mutate of [
      (state) => { state.folderId = "different-folder"; },
      (state) => { state.batches[0].receipt.downloadVerification.sha256 = "c".repeat(64); },
      (state) => { state.batches[0].receipt.remoteMetadata.shared = true; },
      (state) => { state.batches[0].receipt.remoteMetadata.parent_ids = ["wrong-folder"]; },
      (state) => { state.batches[0].receipt.remoteId = "mismatched-file-id"; },
    ]) {
      const state = structuredClone(original); mutate(state); await save(f.ledger, state);
      await assert.rejects(offloadNutrition5k({ ...f, apply: true }));
      await access(path.join(f.dataDir, imageFile));
    }
    await save(f.ledger, original);
    await writeFile(path.join(f.dataDir, imageFile), "tampered");
    await assert.rejects(offloadNutrition5k({ ...f, apply: true }), /ハッシュ/);
    await unlink(path.join(f.dataDir, imageFile));
    await symlink(path.join(f.dataDir, recordFile), path.join(f.dataDir, imageFile));
    await assert.rejects(offloadNutrition5k({ ...f, apply: true }), /通常ファイル/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("索引書き込み後の中断はpending状態から再開し、不足証明では収集を停止", async () => {
  const f = await fixture();
  try {
    const proof = verifiedNutritionProofs(f.state, f.dataDir).get(`nutrition5k/${imageFile}`)[0];
    const entry = { ...proof, imageFile, dishId, status: "eviction-pending", plannedAt: new Date().toISOString() };
    const index = { schemaVersion: 1, dataset: "nutrition5k", dataDir: f.dataDir, folderId: DEFAULT_DRIVE_FOLDER, entries: [entry] };
    const indexFile = path.join(f.dataDir, "archive-cache-index.json"); await save(indexFile, index);
    // Crash before unlink: the still-existing file is verified and then removed.
    assert.equal((await offloadNutrition5k({ ...f, apply: true })).deleted, 1);
    // Crash after unlink but before status update: proof remains sufficient.
    await save(indexFile, index);
    const collected = await collectNutrition5k(f.options, { ...f.deps, fetchImpl: async () => { throw new Error("Must not download"); } });
    assert.equal(collected.total, 1); assert.equal(collected.archivedImages, 1);
    const tampered = structuredClone(index); tampered.entries[0].remoteId = "wrong-remote-id";
    await save(indexFile, tampered);
    await assert.rejects(loadNutritionCache(f.dataDir, { archiveDir: f.archiveDir }), /復元先/);
    await save(indexFile, index);
    f.state.batches[0].status = "ready"; await save(f.ledger, f.state);
    await assert.rejects(collectNutrition5k(f.options, f.deps), /復元先/);
    await unlink(indexFile);
    await assert.rejects(collectNutrition5k(f.options, f.deps), /画像がなく/);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});
