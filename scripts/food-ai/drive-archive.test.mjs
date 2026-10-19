import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, link, mkdtemp, mkdir, readFile, readdir, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { acquireLock } from "./agent-utils.mjs";
import { cleanupArchives, DEFAULT_DRIVE_FOLDER, DISK_RESERVE_BYTES, DRIVE_BUDGET_BYTES, prepareArchives, recordReceipt } from "./drive-archive.mjs";

const run = promisify(execFile);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture({ count = 1, bytes = 32, generic = false } = {}) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "bodymake-drive-test-")));
  const dataDir = path.join(root, "data"), archiveDir = path.join(root, "archive");
  await mkdir(dataDir); await mkdir(archiveDir);
  const sources = [];
  for (let i = 0; i < count; i += 1) {
    const image = Buffer.alloc(bytes, i + 1), id = `commons-${i + 1}`;
    await writeFile(path.join(dataDir, `${id}.jpg`), image);
    await writeFile(path.join(dataDir, `${id}.json`), JSON.stringify({ id, labelVerified: false }));
    sources.push({ id, sha256: hash(image), author: "Fixture author", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", sourceUrl: `https://upload.wikimedia.org/example/${id}.jpg`, filePage: `https://commons.wikimedia.org/wiki/File:${id}.jpg` });
  }
  await writeFile(path.join(dataDir, "sources.json"), JSON.stringify(sources));
  if (generic) await writeFile(path.join(dataDir, "archive-source.json"), JSON.stringify({ schemaVersion: 1, dataset: "nutrition5k", publicSource: { url: "https://github.com/google-research-datasets/Nutrition5k", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" }, files: sources.flatMap(({ id }) => [`${id}.jpg`, `${id}.json`]) }));
  return { root, dataDir, archiveDir, dataset: generic ? "nutrition5k" : "commons", availableBytes: async () => 100_000_000_000 };
}

const receiptFor = (batch) => ({ batchId: batch.id, remoteId: `drive-${batch.id}`, folderId: DEFAULT_DRIVE_FOLDER, size: batch.bytes, md5Checksum: batch.md5, name: batch.filename, trashed: false, verifiedBy: "drive-connector", verifiedAt: new Date().toISOString() });

test("Drive archives are bounded, standard tar, incremental, and include independent attribution", async () => {
  const options = await fixture({ count: 4, bytes: 2000 });
  const first = await prepareArchives({ ...options, maxArchiveBytes: 8192, maxBatches: 10 });
  assert.ok(first.pending.length > 1);
  assert.equal(first.changedFiles, 12);
  assert.equal(first.uploadedBytes, 0);
  assert.equal(first.budgetBytes, DRIVE_BUDGET_BYTES);
  for (const batch of first.pending) {
    assert.ok(batch.bytes <= 8192);
    const archive = await readFile(batch.localPath);
    assert.equal(hash(archive), batch.sha256);
    assert.equal(createHash("md5").update(archive).digest("hex"), batch.md5);
    const manifest = JSON.parse((await run("tar", ["-xOf", batch.localPath, "batch.json"])).stdout);
    assert.equal(manifest.batchId, batch.id);
    for (const file of manifest.files) {
      const entry = await run("tar", ["-xOf", batch.localPath, file.archivePath], { encoding: "buffer" });
      assert.equal(hash(entry.stdout), file.sha256);
    }
  }
  const second = await prepareArchives(options);
  assert.equal(second.prepared, 0);
  assert.equal(second.changedFiles, 0);
  assert.equal(second.reservedBytes, first.reservedBytes);
  await writeFile(path.join(options.dataDir, "commons-1.json"), JSON.stringify({ id: "commons-1", labelVerified: true, review: { method: "visual-agent" } }));
  const changed = await prepareArchives(options);
  assert.equal(changed.changedFiles, 1);
  assert.equal(changed.prepared, 1);
  const state = JSON.parse(await readFile(path.join(options.archiveDir, "state.json"), "utf8"));
  assert.deepEqual(state.batches.at(-1).files.map((file) => file.key), ["commons/records/commons-1.json"]);
});

test("Drive receipts require external metadata verification, are immutable, and don't double-count", async () => {
  const options = await fixture();
  const queue = await prepareArchives(options), batch = queue.pending[0];
  const receipt = receiptFor(batch);
  await assert.rejects(recordReceipt({ ...options, receipt: { ...receipt, md5Checksum: "0".repeat(32) } }), /不一致/);
  await assert.rejects(recordReceipt({ ...options, receipt: { ...receipt, folderId: "another-folder" } }), /受領記録/);
  await assert.rejects(recordReceipt({ ...options, receipt: { ...receipt, verifiedBy: "not-verified" } }), /受領記録/);
  await assert.rejects(recordReceipt({ ...options, receipt: { ...receipt, verifiedAt: "2020-01-01T00:00:00Z" } }), /受領記録/);
  const recorded = await recordReceipt({ ...options, receipt });
  assert.equal(recorded.pending.length, 0);
  assert.equal(recorded.uploadedBytes, queue.reservedBytes);
  assert.equal(recorded.reservedBytes, queue.reservedBytes);
  assert.equal((await recordReceipt({ ...options, receipt })).unchanged, true);
  await assert.rejects(recordReceipt({ ...options, receipt: { ...receipt, remoteId: "different-remote-file" } }), /上書き/);
});

test("Drive reservation budget and local free-space reserve fail closed", async () => {
  const options = await fixture();
  const noRoom = await prepareArchives({ ...options, budgetBytes: 4096 });
  assert.equal(noRoom.stopReason, "drive-budget");
  assert.equal(noRoom.reservedBytes, 0);
  assert.equal(noRoom.prepared, 0);
  await assert.rejects(prepareArchives({ ...options, availableBytes: async () => DISK_RESERVE_BYTES }), /空き容量5GB/);
  assert.equal((await readdir(options.archiveDir)).filter((name) => name.endsWith(".tar")).length, 0);
  await assert.rejects(prepareArchives({ ...options, budgetBytes: DRIVE_BUDGET_BYTES + 1 }), /4TB予算/);
  const queue = await prepareArchives(options);
  await writeFile(path.join(options.dataDir, "commons-1.json"), "{\"labelVerified\":true}");
  const capped = await prepareArchives({ ...options, budgetBytes: queue.reservedBytes });
  assert.equal(capped.stopReason, "drive-budget");
  assert.equal(capped.reservedBytes, queue.reservedBytes);
});

test("Drive archive rejects symlinks, traversal, corrupt metadata, and unknown source hashes", async () => {
  const options = await fixture({ generic: true });
  const sourceFile = path.join(options.dataDir, "archive-source.json");
  const source = JSON.parse(await readFile(sourceFile, "utf8"));
  await writeFile(path.join(options.root, "private.txt"), "not public");
  await symlink(path.join(options.root, "private.txt"), path.join(options.dataDir, "linked.txt"));
  await writeFile(sourceFile, JSON.stringify({ ...source, files: ["linked.txt"] }));
  await assert.rejects(prepareArchives(options), /通常ファイル/);
  await writeFile(sourceFile, JSON.stringify({ ...source, files: ["../private.txt"] }));
  await assert.rejects(prepareArchives(options), /相対パス/);
  await writeFile(sourceFile, JSON.stringify(source));
  assert.equal((await prepareArchives(options)).prepared, 1);
  await writeFile(path.join(options.archiveDir, "state.json"), "{}");
  await assert.rejects(prepareArchives(options), /台帳/);
  const commons = await fixture();
  await writeFile(path.join(commons.dataDir, "commons-1.jpg"), "changed image");
  await assert.rejects(prepareArchives(commons), /ハッシュと不一致/);
});

test("Drive archive lock prevents concurrent reservations and interrupted publication recovers", async () => {
  const options = await fixture();
  const release = await acquireLock(path.join(options.archiveDir, "archive.lock.json"));
  await assert.rejects(prepareArchives(options), /別のDrive/);
  await release();
  const queue = await prepareArchives(options);
  const stateFile = path.join(options.archiveDir, "state.json");
  const state = JSON.parse(await readFile(stateFile, "utf8"));
  state.batches[0].status = "preparing";
  await writeFile(stateFile, JSON.stringify(state));
  const recovered = await prepareArchives(options);
  assert.equal(recovered.prepared, 0);
  assert.equal(recovered.reservedBytes, queue.reservedBytes);
  assert.equal(recovered.pending[0].sha256, queue.pending[0].sha256);
  await writeFile(queue.pending[0].localPath, "tampered");
  await assert.rejects(recordReceipt({ ...options, receipt: receiptFor(queue.pending[0]) }), /準備後に変更/);
});

test("Commons incomplete attribution is excluded without losing originals; legacy license URLs remain recorded", async () => {
  const options = await fixture({ count: 3 });
  const sourceFile = path.join(options.dataDir, "sources.json");
  const sources = JSON.parse(await readFile(sourceFile, "utf8"));
  sources[0].author = "";
  sources[1].license = "CC0"; sources[1].licenseUrl = "http://creativecommons.org/publicdomain/zero/1.0/deed.en";
  sources[2].license = "Public domain"; sources[2].licenseUrl = "";
  await writeFile(sourceFile, JSON.stringify(sources));
  const result = await prepareArchives(options);
  assert.equal(result.changedFiles, 6);
  assert.equal(result.excluded[0].id, "commons-1");
  assert.ok((await readdir(options.dataDir)).includes("commons-1.jpg"));
  const state = JSON.parse(await readFile(path.join(options.archiveDir, "state.json"), "utf8"));
  const attribution = state.batches.flatMap((batch) => batch.files).find((file) => file.key === "commons/attribution/commons-2.json");
  assert.equal(JSON.parse(attribution.inline).licenseUrl, sources[1].licenseUrl);
  assert.equal(JSON.parse(attribution.inline).archiveLicenseReference, "https://creativecommons.org/publicdomain/zero/1.0/");
});

test("Drive readback receipts hash an actual separate file and reject provided-hash-only, samepath, hardlinks, and mismatches", async () => {
  const options = await fixture();
  const queue = await prepareArchives(options), batch = queue.pending[0];
  const receipt = receiptFor(batch);
  delete receipt.md5Checksum;
  receipt.verificationMethod = "download-sha256";
  receipt.claimedSha256 = batch.sha256;
  receipt.remoteMetadata = { id: receipt.remoteId, title: receipt.name, size: String(receipt.size), parent_ids: [receipt.folderId], shared: false };
  delete receipt.trashed;
  await assert.rejects(recordReceipt({ ...options, receipt: { ...receipt, trashed: true } }), /ゴミ箱/);
  await assert.rejects(recordReceipt({ ...options, receipt: { ...receipt, remoteMetadata: undefined } }), /remoteMetadata/);
  await assert.rejects(recordReceipt({ ...options, receipt }), /実ダウンロード/);
  await assert.rejects(recordReceipt({ ...options, receipt, downloadedFile: batch.localPath }), /元アーカイブ自身/);
  const linked = path.join(options.root, "hardlink.tar");
  await link(batch.localPath, linked);
  await assert.rejects(recordReceipt({ ...options, receipt, downloadedFile: linked }), /ハードリンク/);
  const readback = path.join(options.root, "downloaded.tar");
  const badBytes = await readFile(batch.localPath); badBytes[0] ^= 1;
  await writeFile(readback, badBytes);
  await assert.rejects(recordReceipt({ ...options, receipt, downloadedFile: readback }), /ダウンロードSHA-256が不一致/);
  await writeFile(readback, "short");
  await assert.rejects(recordReceipt({ ...options, receipt, downloadedFile: readback }), /ダウンロードサイズが不一致/);
  // A fixture stands in for bytes downloaded by the external connector. The
  // CLI verifies bytes, while the operator must attest the remote provenance.
  await copyFile(batch.localPath, readback);
  const recorded = await recordReceipt({ ...options, receipt, downloadedFile: readback });
  assert.equal(recorded.receiptRecorded, true);
  const state = JSON.parse(await readFile(path.join(options.archiveDir, "state.json"), "utf8"));
  assert.equal(state.batches[0].receipt.downloadVerification.sha256, batch.sha256);
  assert.equal(state.batches[0].receipt.downloadVerification.bytes, batch.bytes);
  assert.equal(state.batches[0].receipt.trashed, undefined);
  assert.deepEqual(state.batches[0].receipt.remoteMetadata, receipt.remoteMetadata);
  assert.equal((await cleanupArchives(options)).planned.length, 1);
});

test("Drive cleanup defaults to dry run and removes only verified local transfer copies", async () => {
  const options = await fixture({ count: 4, bytes: 2000 });
  const queue = await prepareArchives({ ...options, maxArchiveBytes: 8192, maxBatches: 10 });
  const first = queue.pending[0], second = queue.pending[1];
  await recordReceipt({ ...options, receipt: receiptFor(first) });
  const downloads = path.join(options.archiveDir, "downloads"), receipts = path.join(options.archiveDir, "receipts");
  await mkdir(downloads); await mkdir(receipts);
  for (const batch of [first, second]) await copyFile(batch.localPath, path.join(downloads, batch.filename));
  await writeFile(path.join(receipts, "record.json"), JSON.stringify(receiptFor(first)));
  await writeFile(path.join(options.archiveDir, "unknown.tar"), "keep me");
  const sourcesBefore = await readFile(path.join(options.dataDir, "sources.json"));
  const plan = await cleanupArchives(options);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.planned.length, 2);
  assert.equal(plan.deletedBytes, 0);
  assert.equal(plan.plannedBytes, first.bytes * 2);
  assert.ok((await readdir(options.archiveDir)).includes(first.filename));
  const cleaned = await cleanupArchives({ ...options, apply: true });
  assert.equal(cleaned.deleted.length, 2);
  assert.equal(cleaned.deletedBytes, first.bytes * 2);
  await assert.rejects(readFile(first.localPath), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(downloads, first.filename)), { code: "ENOENT" });
  assert.equal((await readFile(second.localPath)).length, second.bytes);
  assert.equal((await readFile(path.join(downloads, second.filename))).length, second.bytes);
  assert.equal((await readFile(path.join(options.archiveDir, "unknown.tar"), "utf8")), "keep me");
  assert.ok(await readFile(path.join(receipts, "record.json")));
  assert.deepEqual(await readFile(path.join(options.dataDir, "sources.json")), sourcesBefore);
  const state = JSON.parse(await readFile(path.join(options.archiveDir, "state.json"), "utf8"));
  assert.ok(state.batches[0].cleanedAt);
  assert.equal(state.batches[0].localCleanup.length, 2);
  assert.equal(state.batches[0].status, "uploaded");
  assert.equal((await cleanupArchives({ ...options, apply: true })).deleted.length, 0);
  const unchanged = await prepareArchives(options);
  assert.equal(unchanged.prepared, 0);
  assert.equal(unchanged.reservedBytes, queue.reservedBytes);
  assert.equal((await recordReceipt({ ...options, receipt: receiptFor(first) })).unchanged, true);
});

test("Drive cleanup validates all candidates before deleting, protecting corrupt files, symlinks, and missing receipts", async () => {
  const options = await fixture();
  const queue = await prepareArchives(options), batch = queue.pending[0];
  await recordReceipt({ ...options, receipt: receiptFor(batch) });
  const downloads = path.join(options.archiveDir, "downloads");
  await mkdir(downloads);
  const downloaded = path.join(downloads, batch.filename);
  const badBytes = await readFile(batch.localPath); badBytes[0] ^= 1;
  await writeFile(downloaded, badBytes);
  await assert.rejects(cleanupArchives({ ...options, apply: true }), /ハッシュが不一致/);
  assert.equal((await readFile(batch.localPath)).length, batch.bytes);
  await unlink(downloaded);
  await symlink(batch.localPath, downloaded);
  await assert.rejects(cleanupArchives({ ...options, apply: true }), /通常ファイル/);
  assert.equal((await readFile(batch.localPath)).length, batch.bytes);
  await unlink(downloaded);
  const stateFile = path.join(options.archiveDir, "state.json");
  const state = JSON.parse(await readFile(stateFile, "utf8"));
  delete state.batches[0].receipt;
  await writeFile(stateFile, JSON.stringify(state));
  assert.equal((await cleanupArchives({ ...options, apply: true })).deleted.length, 0);
  assert.equal((await readFile(batch.localPath)).length, batch.bytes);
  state.batches[0].id = "../../outside-file";
  await writeFile(stateFile, JSON.stringify(state));
  await assert.rejects(cleanupArchives({ ...options, apply: true }), /台帳が不正/);
  assert.equal((await readFile(batch.localPath)).length, batch.bytes);
});
