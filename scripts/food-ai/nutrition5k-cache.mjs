#!/usr/bin/env node
// No Drive API calls. Only verified, public Nutrition5k image staging copies
// are removable; source metadata and restoration receipts remain on disk.
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, readdir, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { acquireLock, readJson, writeJsonAtomic } from "./agent-utils.mjs";
import { DEFAULT_DRIVE_FOLDER, DRIVE_BUDGET_BYTES, MAX_ARCHIVE_BYTES } from "./drive-archive.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IMAGE = /^images\/nutrition5k-(dish_\d{10})\.png$/;
const HASH = /^[a-f0-9]{64}$/;
const INDEX = "archive-cache-index.json";
const SOURCE = "https://github.com/google-research-datasets/Nutrition5k";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const validTime = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const defaultArchiveDir = path.join(root, "ml/artifacts/drive-archive");

async function safeDirectory(directory) {
  const resolved = path.resolve(directory);
  if (resolved === path.parse(resolved).root || resolved === root || await realpath(resolved) !== resolved || !(await lstat(resolved)).isDirectory()) throw new Error(`専用の通常フォルダを指定してください: ${resolved}`);
  return resolved;
}

async function safeFile(directory, relative, optional = false) {
  if (typeof relative !== "string" || path.isAbsolute(relative) || /[\\\x00-\x1f]/.test(relative) || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("相対パスが不正です");
  const file = path.join(directory, relative);
  try {
    const entry = await lstat(file);
    if (!entry.isFile() || entry.isSymbolicLink() || await realpath(file) !== file) throw new Error(`通常ファイル以外は操作しません: ${relative}`);
    return { file, stat: entry };
  } catch (error) { if (optional && error.code === "ENOENT") return null; throw error; }
}

async function hashFile(file) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 5_000_000) throw new Error("画像キャッシュのサイズが不正です");
    const bytes = await handle.readFile();
    if (bytes.length !== stat.size) throw new Error("画像が読み取り中に変更されました");
    return { sha256: digest(bytes), bytes: bytes.length, dev: stat.dev, ino: stat.ino, mtimeMs: stat.mtimeMs };
  } finally { await handle.close(); }
}

// An uploaded flag or Drive MD5 metadata alone is deliberately insufficient.
// The shared archive helper records this receipt only after full remote readback.
export function verifiedNutritionProofs(state, dataDir, folderId = DEFAULT_DRIVE_FOLDER) {
  if (state?.schemaVersion !== 1 || state.folderId !== folderId || state.budgetBytes !== DRIVE_BUDGET_BYTES || !Array.isArray(state.batches)) throw new Error("Drive台帳の保存先・容量上限・形式が一致しません");
  const proofs = new Map();
  for (const batch of state.batches) {
    if (batch.dataset !== "nutrition5k" || batch.dataDir !== dataDir || batch.status !== "uploaded") continue;
    const receipt = batch.receipt;
    if (receipt?.verificationMethod !== "download-sha256") continue;
    const remote = receipt.remoteMetadata; const readback = receipt.downloadVerification;
    if (!/^batch-\d{8}-[a-f0-9]{16}$/.test(batch.id ?? "") || !HASH.test(batch.sha256 ?? "") || !/^[a-f0-9]{32}$/.test(batch.md5 ?? "") ||
        !Number.isSafeInteger(batch.bytes) || batch.bytes < 1 || batch.bytes > MAX_ARCHIVE_BYTES || !Array.isArray(batch.files) ||
        receipt.batchId !== batch.id || receipt.folderId !== folderId || !/^[A-Za-z0-9_-]{5,200}$/.test(receipt.remoteId ?? "") || receipt.name !== `${batch.id}.tar` || receipt.size !== batch.bytes ||
        receipt.verifiedBy !== "drive-connector" || !validTime(receipt.verifiedAt) || !validTime(receipt.recordedAt) ||
        readback?.bytes !== batch.bytes || readback?.sha256 !== batch.sha256 || readback?.md5 !== batch.md5 || !validTime(readback?.checkedAt) ||
        remote?.id !== receipt.remoteId || remote?.title !== receipt.name || remote?.mime_type !== "application/x-tar" || Number(remote?.size) !== batch.bytes || remote?.shared !== false ||
        !Array.isArray(remote?.parent_ids) || !remote.parent_ids.includes(folderId)) throw new Error(`完全再取得の検証記録が不正です: ${batch.id}`);
    for (const file of batch.files) {
      if (typeof file.key !== "string" || !file.key.startsWith("nutrition5k/")) continue;
      if (file.key !== `nutrition5k/${file.source}` || !HASH.test(file.sha256 ?? "") || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new Error(`アーカイブ内のファイル記録が不正です: ${batch.id}`);
      const proof = { key: file.key, sha256: file.sha256, bytes: file.bytes, batchId: batch.id, remoteId: receipt.remoteId, archiveSha256: batch.sha256, archiveBytes: batch.bytes, archiveObjectPath: `objects/${file.sha256}`, folderId, verifiedAt: readback.checkedAt };
      // Keep every revision: an older, still-present object can prove an evicted
      // image even if other metadata was subsequently archived under the same key.
      const versions = proofs.get(file.key) ?? [];
      versions.push(proof); proofs.set(file.key, versions);
    }
  }
  return proofs;
}

function matchingProof(proofs, key, sha256, bytes, prior) {
  return proofs.get(key)?.find((proof) => proof.sha256 === sha256 && proof.bytes === bytes && (!prior ||
    ["batchId", "remoteId", "archiveSha256", "archiveBytes", "archiveObjectPath", "folderId"].every((field) => proof[field] === prior[field])));
}

function validateIndex(index, dataDir, folderId, proofs) {
  if (index?.schemaVersion !== 1 || index.dataset !== "nutrition5k" || index.dataDir !== dataDir || index.folderId !== folderId || !Array.isArray(index.entries)) throw new Error("画像キャッシュ索引のデータセット・保存先が一致しません");
  const entries = new Map();
  for (const entry of index.entries) {
    const dish = IMAGE.exec(entry.imageFile ?? "")?.[1];
    if (!dish || entry.dishId !== dish || entries.has(entry.imageFile) || !HASH.test(entry.sha256 ?? "") || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > 5_000_000 ||
        !["eviction-pending", "evicted"].includes(entry.status) || !validTime(entry.plannedAt) || !matchingProof(proofs, `nutrition5k/${entry.imageFile}`, entry.sha256, entry.bytes, entry)) throw new Error(`画像の復元先を検証できません: ${entry.imageFile}`);
    entries.set(entry.imageFile, entry);
  }
  return entries;
}

export async function loadNutritionCache(dataDir, { archiveDir = defaultArchiveDir, folderId = DEFAULT_DRIVE_FOLDER } = {}) {
  const directory = await safeDirectory(dataDir);
  const indexFile = await safeFile(directory, INDEX, true);
  if (!indexFile) return new Map();
  const archive = await safeDirectory(archiveDir);
  const ledger = await safeFile(archive, "state.json");
  const proofs = verifiedNutritionProofs(await readJson(ledger.file), directory, folderId);
  return validateIndex(await readJson(indexFile.file), directory, folderId, proofs);
}

export function assertArchivedImage(record, cache) {
  const entry = cache.get(record.imageFile);
  if (!entry || entry.dishId !== record.dishId || entry.sha256 !== record.imageSha256 || entry.bytes !== record.imageBytes) throw new Error(`画像がなく、Drive復元先の一致も確認できません: ${record.imageFile}`);
  return entry;
}

export async function offloadNutrition5k(options = {}) {
  const dataDir = await safeDirectory(options.dataDir ?? path.join(root, "training-data/nutrition5k"));
  const archiveDir = await safeDirectory(options.archiveDir ?? defaultArchiveDir);
  const folderId = options.folderId ?? DEFAULT_DRIVE_FOLDER;
  if (!/^[A-Za-z0-9_-]{5,200}$/.test(folderId)) throw new Error("保存先IDが不正です");
  await safeDirectory(path.join(dataDir, "images")); await safeDirectory(path.join(dataDir, "records"));
  const releaseData = await acquireLock(path.join(dataDir, ".nutrition5k.lock.json"));
  if (!releaseData) throw new Error("Nutrition5k収集が動作中です");
  let releaseArchive;
  try {
    releaseArchive = await acquireLock(path.join(archiveDir, "archive.lock.json"));
    if (!releaseArchive) throw new Error("Driveアーカイブ処理が動作中です");
    const ledgerFile = await safeFile(archiveDir, "state.json");
    const proofs = verifiedNutritionProofs(await readJson(ledgerFile.file), dataDir, folderId);
    const indexFile = await safeFile(dataDir, INDEX, true);
    const index = indexFile ? await readJson(indexFile.file) : { schemaVersion: 1, dataset: "nutrition5k", dataDir, folderId, entries: [] };
    const indexed = validateIndex(index, dataDir, folderId, proofs);
    const manifestFile = await safeFile(dataDir, "archive-source.json");
    const manifest = await readJson(manifestFile.file);
    if (manifest.schemaVersion !== 1 || manifest.dataset !== "nutrition5k" || manifest.publicSource?.url !== SOURCE || manifest.publicSource?.license !== "CC BY 4.0" || !Array.isArray(manifest.files)) throw new Error("公開Nutrition5k出典マニフェストが不正です");
    const planned = []; const skipped = []; let alreadyEvicted = 0;
    for (const name of await readdir(path.join(dataDir, "records"))) {
      if (!/^nutrition5k-dish_\d{10}\.json$/.test(name)) throw new Error(`未管理レコードは操作しません: ${name}`);
      const recordFile = await safeFile(dataDir, `records/${name}`);
      const rawRecord = await readFile(recordFile.file); const record = JSON.parse(rawRecord);
      const imageFile = `images/${name.replace(/\.json$/, ".png")}`;
      const dishId = IMAGE.exec(imageFile)[1];
      if (record.schemaVersion !== 1 || record.dataset !== "nutrition5k" || record.id !== `nutrition5k-${dishId}` || record.dishId !== dishId || record.imageFile !== imageFile || !HASH.test(record.imageSha256 ?? "") ||
          !Number.isSafeInteger(record.imageBytes) || record.imageBytes < 1 || record.imageBytes > 5_000_000 || record.source?.url !== SOURCE || record.source?.license !== "CC BY 4.0" ||
          record.source?.imageUrl !== `https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/${dishId}/rgb.png` ||
          record.labelOrigin !== "dataset-provided-nutrition-metadata" || record.classificationLabel !== null) throw new Error(`公開画像レコードが不正です: ${name}`);
      const local = await safeFile(dataDir, imageFile, true);
      if (!local) { assertArchivedImage(record, indexed); alreadyEvicted += 1; continue; }
      const image = await hashFile(local.file);
      if (image.sha256 !== record.imageSha256 || image.bytes !== record.imageBytes) throw new Error(`画像のハッシュ/サイズが元データと一致しません: ${imageFile}`);
      const proof = matchingProof(proofs, `nutrition5k/${imageFile}`, image.sha256, image.bytes, indexed.get(imageFile));
      const recordProof = matchingProof(proofs, `nutrition5k/records/${name}`, digest(rawRecord), rawRecord.length);
      if (!proof || !recordProof) { skipped.push({ imageFile, reason: "画像と正解JSONの両方に完全再取得済みDrive証明が必要です" }); continue; }
      planned.push({ imageFile, dishId, ...image, proof, recordFile: `records/${name}`, recordSha256: digest(rawRecord) });
    }
    const result = { schemaVersion: 1, dataset: "nutrition5k", dryRun: options.apply !== true, folderId, eligible: planned.length, eligibleBytes: planned.reduce((sum, item) => sum + item.bytes, 0), alreadyEvicted, skipped, deleted: 0, deletedBytes: 0 };
    if (!options.apply || planned.length === 0) return result;
    const plannedAt = new Date().toISOString();
    for (const item of planned) indexed.set(item.imageFile, { ...(indexed.get(item.imageFile) ?? {}), ...item.proof, imageFile: item.imageFile, dishId: item.dishId, status: "eviction-pending", plannedAt });
    index.entries = [...indexed.values()]; index.updatedAt = plannedAt;
    // Durable restore routes MUST precede removal. A crash with pending status
    // is recoverable whether the local image still exists or has been evicted.
    await writeJsonAtomic(path.join(dataDir, INDEX), index);
    const removing = new Set(planned.map((item) => item.imageFile));
    manifest.files = [...new Set([...manifest.files.filter((file) => !removing.has(file)), INDEX])].sort();
    await writeJsonAtomic(manifestFile.file, manifest);
    try {
      for (const item of planned) {
        const file = await safeFile(dataDir, item.imageFile);
        const current = await hashFile(file.file);
        const record = await safeFile(dataDir, item.recordFile);
        if (["sha256", "bytes", "dev", "ino", "mtimeMs"].some((key) => current[key] !== item[key]) || digest(await readFile(record.file)) !== item.recordSha256) throw new Error(`削除直前に画像または正解が変わりました: ${item.imageFile}`);
        await unlink(file.file); // Only this individually validated PNG, never a directory.
        indexed.get(item.imageFile).status = "evicted";
        indexed.get(item.imageFile).evictedAt = new Date().toISOString();
        result.deleted += 1; result.deletedBytes += item.bytes;
      }
    } finally {
      index.entries = [...indexed.values()]; index.updatedAt = new Date().toISOString();
      await writeJsonAtomic(path.join(dataDir, INDEX), index);
    }
    return result;
  } finally { if (releaseArchive) await releaseArchive(); await releaseData(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { data: { type: "string" }, archive: { type: "string" }, folder: { type: "string" }, apply: { type: "boolean" }, help: { type: "boolean" } } });
  if (values.help) console.log("node scripts/food-ai/nutrition5k-cache.mjs [--data training-data/nutrition5k] [--archive ml/artifacts/drive-archive] [--apply]\n既定は確認のみ。Drive完全再取得SHA-256検証済みの公開Nutrition5k PNGだけを、復元索引を先に保存してローカルから除去。正解JSON・CSV・split・Drive本体は変更しません。復元手順: scripts/food-ai/nutrition5k-cache.md");
  else {
    try { console.log(JSON.stringify(await offloadNutrition5k({ dataDir: values.data, archiveDir: values.archive, folderId: values.folder, apply: values.apply ?? false }), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
