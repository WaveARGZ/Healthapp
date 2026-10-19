#!/usr/bin/env node
// Creates local public-data archives only. Upload and remote verification are
// deliberately separate, credential-free operations performed by a connector.
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readFile, realpath, statfs, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { acquireLock, readJson, writeJsonAtomic } from "./agent-utils.mjs";

export const DRIVE_BUDGET_BYTES = 4_000_000_000_000;
export const MAX_ARCHIVE_BYTES = 100_000_000;
export const DISK_RESERVE_BYTES = 5_000_000_000;
export const DEFAULT_DRIVE_FOLDER = "1-43fJG6gRjTVX0FPSi4_-sfRsSmP-hJT";
const defaultArchiveDir = path.resolve("ml/artifacts/drive-archive");
const digest = (value, kind = "sha256") => createHash(kind).update(value).digest("hex");
const jsonBuffer = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const padding = (size) => (512 - size % 512) % 512;
const hashPattern = /^[a-f0-9]{64}$/;
const remoteIdPattern = /^[A-Za-z0-9_-]{5,200}$/;
const batchIdPattern = /^batch-\d{8}-[a-f0-9]{16}$/;

function relativeName(value) {
  if (typeof value !== "string" || !value || value.length > 500 || /[\\\x00-\x1f]/.test(value) || path.isAbsolute(value) || value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("アーカイブ対象の相対パスが不正です");
  return value;
}

async function safeDirectory(value, create = false) {
  const dir = path.resolve(value);
  if (create) await mkdir(dir, { recursive: true });
  if ((await realpath(dir)) !== dir || !(await lstat(dir)).isDirectory()) throw new Error(`シンボリックリンクを含む保存先は使えません: ${dir}`);
  return dir;
}

async function safeFile(dir, relative) {
  const filename = path.join(dir, relativeName(relative));
  if ((await realpath(filename)) !== filename || !(await lstat(filename)).isFile()) throw new Error(`通常ファイルではありません: ${relative}`);
  return filename;
}

async function fileDescriptor(dir, relative, key) {
  const filename = await safeFile(dir, relative);
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (stat.size > MAX_ARCHIVE_BYTES) throw new Error(`対象ファイルが100MBを超えています: ${relative}`);
    const hasher = createHash("sha256");
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) { hasher.update(chunk); bytes += chunk.length; }
    if (bytes !== stat.size) throw new Error(`読み込み中にサイズが変わりました: ${relative}`);
    return { key, source: relative, bytes, sha256: hasher.digest("hex") };
  } finally { await handle.close(); }
}

function inlineDescriptor(key, value) {
  const bytes = jsonBuffer(value);
  return { key, inline: bytes.toString("utf8"), bytes: bytes.length, sha256: digest(bytes) };
}

function publicUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}

function commonsLicenseReference(source) {
  const license = source.license ?? "";
  const ccBy = license.match(/^CC BY (1\.0|2\.0|2\.5|3\.0|4\.0)$/i);
  const suffix = ccBy ? `/licenses/by/${ccBy[1]}` : /^CC0(?: 1\.0)?$/i.test(license) ? "/publicdomain/zero/1.0" : /^(?:Public domain|PDM(?: 1\.0)?)$/i.test(license) ? "/publicdomain/mark/1.0" : null;
  if (!suffix) return null;
  // Legacy Commons metadata used http links and left Public domain blank.
  // Preserve it unchanged, while adding the canonical equivalent reference.
  if (source.licenseUrl) {
    try {
      const url = new URL(source.licenseUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.hostname !== "creativecommons.org" || url.username || url.password || ![suffix, `${suffix}/`].some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${suffix}/`))) return null;
    } catch { return null; }
  } else if (ccBy) return null;
  return `https://creativecommons.org${suffix}/`;
}

// Commons keeps attribution per object, so adding one photograph does not
// repeatedly upload the entire growing sources.json manifest.
export async function inventory(dataDir, dataset) {
  const dir = await safeDirectory(dataDir);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(dataset)) throw new Error("dataset名が不正です");
  const files = [], excluded = [];
  if (dataset === "commons") {
    const sources = JSON.parse(await readFile(await safeFile(dir, "sources.json"), "utf8"));
    if (!Array.isArray(sources)) throw new Error("sources.jsonが配列ではありません");
    const ids = new Set();
    for (const source of sources) {
      if (!/^commons-\d+$/.test(source.id ?? "") || ids.has(source.id) || !hashPattern.test(source.sha256 ?? "")) throw new Error("Commons出典のIDまたはハッシュが不正です");
      ids.add(source.id);
      const licenseReference = commonsLicenseReference(source);
      if (!publicUrl(source.filePage) || !licenseReference || !publicUrl(source.sourceUrl) || (/^CC BY /i.test(source.license) && (typeof source.author !== "string" || !source.author.trim()))) {
        excluded.push({ id: source.id, reason: "公開出典・対応ライセンス・必要な作者表記が不足しているため外部保管対象外。元データは保持。" });
        continue;
      }
      let image;
      for (const extension of ["jpg", "jpeg", "png"]) {
        try {
          const item = await fileDescriptor(dir, `${source.id}.${extension}`, `commons/images/${source.id}.${extension}`);
          if (image) throw new Error(`画像拡張子が重複しています: ${source.id}`);
          image = item;
        } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      if (!image || image.sha256 !== source.sha256) throw new Error(`画像が欠落または出典ハッシュと不一致です: ${source.id}`);
      files.push(image, await fileDescriptor(dir, `${source.id}.json`, `commons/records/${source.id}.json`), inlineDescriptor(`commons/attribution/${source.id}.json`, { ...source, archiveLicenseReference: licenseReference }));
    }
  } else {
    const sourceFile = await safeFile(dir, "archive-source.json");
    const manifest = JSON.parse(await readFile(sourceFile, "utf8"));
    if (manifest.schemaVersion !== 1 || manifest.dataset !== dataset || !publicUrl(manifest.publicSource?.url) || !publicUrl(manifest.publicSource?.licenseUrl) || typeof manifest.publicSource?.license !== "string" || !manifest.publicSource.license.trim() || !Array.isArray(manifest.files)) throw new Error("archive-source.jsonに公開出典・ライセンス・ファイル一覧が必要です");
    const names = ["archive-source.json", ...manifest.files];
    if (new Set(names).size !== names.length) throw new Error("ファイル一覧が重複しています");
    for (const relative of names) files.push(await fileDescriptor(dir, relative, `${dataset}/${relativeName(relative)}`));
  }
  return { files: files.sort((a, b) => a.key.localeCompare(b.key)), excluded };
}

function tarHeader(name, size) {
  if (Buffer.byteLength(name) > 100 || !Number.isSafeInteger(size) || size < 0 || size > MAX_ARCHIVE_BYTES) throw new Error("tarエントリが上限を超えています");
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  for (const [offset, length, value] of [[100, 8, 0o644], [108, 8, 0], [116, 8, 0], [124, 12, size], [136, 12, 0]]) header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length, "ascii");
  header.fill(32, 148, 156);
  header.write("0", 156); header.write("ustar\0", 257, 6); header.write("00", 263, 2);
  header.write(`${header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, "0")}\0 `, 148, 8);
  return header;
}

function archiveEntries(batch) {
  const files = batch.files.map((item) => ({ ...item, archivePath: `objects/${item.sha256}` }));
  const manifest = inlineDescriptor("batch.json", { schemaVersion: 1, batchId: batch.id, dataset: batch.dataset, createdAt: batch.createdAt, format: "incremental-public-data", files: files.map(({ key, bytes, sha256, archivePath }) => ({ key, bytes, sha256, archivePath })) });
  const unique = [...new Map(files.map((item) => [item.sha256, item])).values()];
  return [{ ...manifest, archivePath: "batch.json" }, ...unique];
}

function archiveSize(batch) { return archiveEntries(batch).reduce((sum, item) => sum + 512 + item.bytes + padding(item.bytes), 1024); }

async function streamArchive(batch, writer) {
  const sha = createHash("sha256"), md5 = createHash("md5");
  let size = 0;
  const write = async (chunk) => { size += chunk.length; if (size > MAX_ARCHIVE_BYTES) throw new Error("アーカイブが100MBを超えました"); sha.update(chunk); md5.update(chunk); await writer?.(chunk); };
  for (const entry of archiveEntries(batch)) {
    await write(tarHeader(entry.archivePath, entry.bytes));
    const itemHasher = createHash("sha256"); let bytes = 0;
    const copy = async (chunk) => { bytes += chunk.length; itemHasher.update(chunk); await write(chunk); };
    if (entry.inline !== undefined) await copy(Buffer.from(entry.inline));
    else {
      const filename = await safeFile(batch.dataDir, entry.source);
      const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
      try { for await (const chunk of handle.createReadStream({ autoClose: false })) await copy(chunk); }
      finally { await handle.close(); }
    }
    if (bytes !== entry.bytes || itemHasher.digest("hex") !== entry.sha256) throw new Error(`準備中に元データが変わりました: ${entry.key}`);
    if (padding(bytes)) await write(Buffer.alloc(padding(bytes)));
  }
  await write(Buffer.alloc(1024));
  return { bytes: size, sha256: sha.digest("hex"), md5: md5.digest("hex") };
}

async function archiveHashes(file) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  const sha = createHash("sha256"), md5 = createHash("md5"); let bytes = 0;
  try { for await (const chunk of handle.createReadStream({ autoClose: false })) { bytes += chunk.length; sha.update(chunk); md5.update(chunk); } }
  finally { await handle.close(); }
  return { bytes, sha256: sha.digest("hex"), md5: md5.digest("hex") };
}

async function loadState(dir, folderId, budgetBytes) {
  const file = path.join(dir, "state.json");
  try { await safeFile(dir, "state.json"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const state = await readJson(file, { schemaVersion: 1, folderId, budgetBytes, batches: [] });
  if (state.schemaVersion !== 1 || state.folderId !== folderId || !Array.isArray(state.batches) || !Number.isSafeInteger(state.budgetBytes) || state.budgetBytes < 1 || state.budgetBytes > DRIVE_BUDGET_BYTES) throw new Error("Drive台帳または保存先が不一致です。既存台帳は上書きしません");
  state.budgetBytes = Math.min(state.budgetBytes, budgetBytes);
  const ids = new Set();
  for (const batch of state.batches) {
    if (!batchIdPattern.test(batch.id ?? "") || ids.has(batch.id) || !["preparing", "ready", "uploaded", "failed"].includes(batch.status) || !Array.isArray(batch.files) || !Number.isSafeInteger(batch.bytes) || batch.bytes <= 0 || batch.bytes > MAX_ARCHIVE_BYTES || !hashPattern.test(batch.sha256 ?? "") || !/^[a-f0-9]{32}$/.test(batch.md5 ?? "")) throw new Error("Driveアーカイブ台帳が不正です");
    ids.add(batch.id);
    for (const item of batch.files) { relativeName(item.key); if (item.source) relativeName(item.source); if (!hashPattern.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > MAX_ARCHIVE_BYTES) throw new Error("台帳エントリが不正です"); }
  }
  if (reservedBytes(state) > state.budgetBytes) throw new Error("保存済みと予約済みの合計が指定予算を超えています");
  return state;
}

export const reservedBytes = (state) => state.batches.filter((batch) => batch.status !== "failed").reduce((sum, batch) => sum + batch.bytes, 0);

async function freeBytes(dir) { const value = await statfs(dir); return value.bavail * value.bsize; }

async function materialize(dir, batch) {
  const target = path.join(dir, `${batch.id}.tar`);
  try {
    const existing = await archiveHashes(await safeFile(dir, `${batch.id}.tar`));
    if (existing.sha256 !== batch.sha256 || existing.bytes !== batch.bytes || existing.md5 !== batch.md5) throw new Error("既存アーカイブが台帳と不一致です。上書きしません");
    return;
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const temporary = path.join(dir, `${batch.id}.${randomUUID()}.part`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    const result = await streamArchive(batch, async (chunk) => {
      let offset = 0;
      while (offset < chunk.length) offset += (await handle.write(chunk, offset, chunk.length - offset)).bytesWritten;
    });
    if (result.bytes !== batch.bytes || result.sha256 !== batch.sha256 || result.md5 !== batch.md5) throw new Error("アーカイブの検証に失敗しました");
    await handle.sync(); await handle.close();
    // Publish atomically and exclusively, including against non-cooperating
    // writers. An existing target is never replaced.
    await link(temporary, target);
  } finally { await handle.close().catch(() => {}); await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
}

async function withArchiveState(options, action) {
  const dir = await safeDirectory(options.archiveDir ?? defaultArchiveDir, true);
  const folderId = options.folderId ?? DEFAULT_DRIVE_FOLDER;
  const budgetBytes = options.budgetBytes ?? DRIVE_BUDGET_BYTES;
  if (!remoteIdPattern.test(folderId) || !Number.isSafeInteger(budgetBytes) || budgetBytes < 1 || budgetBytes > DRIVE_BUDGET_BYTES) throw new Error("保存先または4TB予算が不正です");
  const release = await acquireLock(path.join(dir, "archive.lock.json"));
  if (!release) throw new Error("別のDriveアーカイブ処理が実行中です");
  try { return await action(dir, await loadState(dir, folderId, budgetBytes)); }
  finally { await release(); }
}

async function saveQueue(dir, state, result = {}) {
  const queue = { schemaVersion: 1, updatedAt: new Date().toISOString(), folderId: state.folderId, budgetBytes: state.budgetBytes, reservedBytes: reservedBytes(state), uploadedBytes: state.batches.filter((batch) => batch.status === "uploaded").reduce((sum, batch) => sum + batch.bytes, 0), ...result,
    uploadRequired: state.batches.some((batch) => batch.status === "ready"), note: "これはローカル準備です。Driveへのアップロード・親フォルダ/サイズ/MD5の実確認後にreceiptを記録してください。",
    pending: state.batches.filter((batch) => batch.status === "ready").map(({ id, bytes, sha256, md5, dataset }) => ({ id, dataset, bytes, sha256, md5, filename: `${id}.tar`, localPath: path.join(dir, `${id}.tar`) })) };
  await writeJsonAtomic(path.join(dir, "queue.json"), queue);
  return queue;
}

export async function prepareArchives(options = {}) {
  return withArchiveState(options, async (dir, state) => {
    const dataset = options.dataset ?? "commons";
    const dataDir = await safeDirectory(options.dataDir ?? "training-data/commons");
    const maxBytes = options.maxArchiveBytes ?? MAX_ARCHIVE_BYTES, maxBatches = options.maxBatches ?? 3;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 4096 || maxBytes > MAX_ARCHIVE_BYTES || !Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 100) throw new Error("バッチサイズまたはバッチ数が不正です");
    const ensureSpace = async (bytes) => { if (await (options.availableBytes ?? freeBytes)(dir) < DISK_RESERVE_BYTES + bytes) throw new Error("ローカル空き容量5GBを維持するため停止しました"); };
    // A crash after publishing the tar but before saving the state is recovered
    // by verifying the immutable file. Missing original snapshots fail closed.
    for (const batch of state.batches.filter((item) => item.status === "preparing")) {
      await ensureSpace(batch.bytes);
      await materialize(dir, batch);
      batch.status = "ready";
      await writeJsonAtomic(path.join(dir, "state.json"), state);
    }
    const known = new Map();
    for (const batch of state.batches.filter((item) => ["ready", "uploaded"].includes(item.status))) for (const item of batch.files) known.set(item.key, item.sha256);
    const { files, excluded } = await inventory(dataDir, dataset);
    const changes = files.filter((item) => known.get(item.key) !== item.sha256);
    let offset = 0, prepared = 0, stopReason = "complete";
    while (offset < changes.length && prepared < maxBatches) {
      const createdAt = new Date().toISOString();
      const batch = { id: `batch-${String(state.batches.length + 1).padStart(8, "0")}-${digest(`${dataset}:${createdAt}:${randomUUID()}`).slice(0, 16)}`, dataset, dataDir, createdAt, files: [], status: "preparing" };
      while (offset < changes.length) {
        batch.files.push(changes[offset]);
        if (archiveSize(batch) > maxBytes) { batch.files.pop(); break; }
        offset += 1;
      }
      if (!batch.files.length) throw new Error(`1ファイルがバッチ上限を超えています: ${changes[offset].key}`);
      const bytes = archiveSize(batch);
      if (reservedBytes(state) + bytes > state.budgetBytes) { stopReason = "drive-budget"; break; }
      await ensureSpace(bytes);
      Object.assign(batch, await streamArchive(batch));
      state.batches.push(batch);
      // Exact-byte reservation is persisted before any local archive is written.
      await writeJsonAtomic(path.join(dir, "state.json"), state);
      await materialize(dir, batch);
      batch.status = "ready"; prepared += 1;
      await writeJsonAtomic(path.join(dir, "state.json"), state);
    }
    if (offset < changes.length && stopReason === "complete") stopReason = "batch-limit";
    return saveQueue(dir, state, { prepared, changedFiles: changes.length, stopReason, excluded });
  });
}

export async function recordReceipt(options = {}) {
  return withArchiveState(options, async (dir, state) => {
    const receipt = options.receipt;
    const method = receipt?.verificationMethod ?? "drive-md5";
    const trashStateAllowed = method === "download-sha256" ? receipt?.trashed === undefined || receipt?.trashed === false : receipt?.trashed === false;
    if (!receipt || !batchIdPattern.test(receipt.batchId ?? "") || !remoteIdPattern.test(receipt.remoteId ?? "") || receipt.folderId !== state.folderId || !Number.isSafeInteger(receipt.size) || !["drive-md5", "download-sha256"].includes(method) || (method === "drive-md5" && !/^[a-f0-9]{32}$/.test(receipt.md5Checksum ?? "")) || !trashStateAllowed || receipt.verifiedBy !== "drive-connector" || !Number.isFinite(Date.parse(receipt.verifiedAt)) || Math.abs(Date.now() - Date.parse(receipt.verifiedAt)) > 24 * 60 * 60 * 1000) throw new Error("Driveコネクタで24時間以内に確認したID・親フォルダ・sizeと実チェックサム検証の受領記録が必要です。ゴミ箱入りのファイルは受理しません");
    if (method === "download-sha256") {
      const metadata = receipt.remoteMetadata;
      if (!metadata || metadata.id !== receipt.remoteId || metadata.title !== receipt.name || Number(metadata.size) !== receipt.size || !Array.isArray(metadata.parent_ids) || !metadata.parent_ids.includes(receipt.folderId)) throw new Error("Driveコネクタが返したid/title/size/parent_idsをremoteMetadataにそのまま保存してください");
    }
    const batch = state.batches.find((item) => item.id === receipt.batchId);
    if (!batch || !["ready", "uploaded"].includes(batch.status)) throw new Error("アップロード待ちバッチが見つかりません");
    if (receipt.name !== `${batch.id}.tar` || receipt.size !== batch.bytes || (receipt.md5Checksum !== undefined && receipt.md5Checksum !== batch.md5)) throw new Error("Driveのファイル名・サイズ・MD5がローカルアーカイブと不一致です");
    if (state.batches.some((item) => item.id !== batch.id && item.receipt?.remoteId === receipt.remoteId)) throw new Error("同一DriveファイルIDが別バッチに使われています");
    if (batch.status === "uploaded") {
      if (batch.receipt.remoteId !== receipt.remoteId) throw new Error("既存の受領記録は上書きしません");
      return saveQueue(dir, state, { receiptRecorded: false, unchanged: true });
    }
    const sourcePath = await safeFile(dir, `${batch.id}.tar`);
    const local = await archiveHashes(sourcePath);
    if (local.sha256 !== batch.sha256 || local.md5 !== batch.md5 || local.bytes !== batch.bytes) throw new Error("アップロード元が準備後に変更されています");
    let downloadVerification;
    if (method === "download-sha256") {
      if (typeof options.downloadedFile !== "string" || !path.isAbsolute(options.downloadedFile)) throw new Error("Driveから別ファイルとして実ダウンロードした絶対パスを--downloaded-fileで指定してください");
      const readbackPath = await safeFile(await safeDirectory(path.dirname(options.downloadedFile)), path.basename(options.downloadedFile));
      const [originalStat, downloadedStat] = await Promise.all([lstat(sourcePath), lstat(readbackPath)]);
      if (readbackPath === sourcePath || (originalStat.dev === downloadedStat.dev && originalStat.ino === downloadedStat.ino)) throw new Error("元アーカイブ自身・ハードリンクをダウンロード証跡に使えません");
      if (downloadedStat.size !== batch.bytes) throw new Error("Driveからのダウンロードサイズが不一致です");
      const readback = await archiveHashes(readbackPath);
      if (readback.sha256 !== batch.sha256 || readback.bytes !== batch.bytes) throw new Error("DriveからのダウンロードSHA-256が不一致です");
      downloadVerification = { ...readback, checkedAt: new Date().toISOString() };
    }
    batch.receipt = { ...receipt, verificationMethod: method, ...(downloadVerification ? { downloadVerification } : {}), recordedAt: new Date().toISOString() };
    batch.status = "uploaded";
    await writeJsonAtomic(path.join(dir, "state.json"), state);
    return saveQueue(dir, state, { receiptRecorded: true });
  });
}

function receiptAllowsCleanup(batch, folderId) {
  const receipt = batch.receipt;
  if (batch.status !== "uploaded" || !receipt || receipt.batchId !== batch.id || !remoteIdPattern.test(receipt.remoteId ?? "") || receipt.folderId !== folderId || receipt.name !== `${batch.id}.tar` || receipt.size !== batch.bytes || receipt.verifiedBy !== "drive-connector" || receipt.trashed === true || !Number.isFinite(Date.parse(receipt.verifiedAt)) || !Number.isFinite(Date.parse(receipt.recordedAt))) return false;
  const method = receipt.verificationMethod ?? "drive-md5";
  if (method === "drive-md5") return receipt.trashed === false && receipt.md5Checksum === batch.md5;
  if (method !== "download-sha256") return false;
  const metadata = receipt.remoteMetadata, readback = receipt.downloadVerification;
  return metadata?.id === receipt.remoteId && metadata?.title === receipt.name && Number(metadata?.size) === batch.bytes && Array.isArray(metadata?.parent_ids) && metadata.parent_ids.includes(folderId) && readback?.sha256 === batch.sha256 && readback?.bytes === batch.bytes && Number.isFinite(Date.parse(readback.checkedAt));
}

export async function cleanupArchives(options = {}) {
  return withArchiveState(options, async (dir, state) => {
    if (options.apply !== undefined && typeof options.apply !== "boolean") throw new Error("cleanupのapplyはbooleanで指定してください");
    const planned = [], skipped = [];
    // Only these two exact generated filenames are candidates. Never walk
    // source directories, use wildcards, or recursively delete any directory.
    for (const batch of state.batches) {
      if (!receiptAllowsCleanup(batch, state.folderId)) { skipped.push({ id: batch.id, reason: "Drive検証済み受領記録がないため保持" }); continue; }
      for (const relative of [`${batch.id}.tar`, `downloads/${batch.id}.tar`]) {
        let file;
        try { file = await safeFile(dir, relative); }
        catch (error) { if (error.code === "ENOENT") continue; throw error; }
        const stat = await lstat(file);
        if (stat.size !== batch.bytes) throw new Error(`削除対象のサイズが不一致です。何も削除しません: ${relative}`);
        const hashes = await archiveHashes(file);
        if (hashes.bytes !== batch.bytes || hashes.sha256 !== batch.sha256 || hashes.md5 !== batch.md5) throw new Error(`削除対象のハッシュが不一致です。何も削除しません: ${relative}`);
        planned.push({ batchId: batch.id, relative, localPath: file, bytes: hashes.bytes, sha256: hashes.sha256, dev: stat.dev, ino: stat.ino, mtimeMs: stat.mtimeMs });
      }
    }
    const cleanedAt = new Date().toISOString();
    const result = { schemaVersion: 1, dryRun: options.apply !== true, folderId: state.folderId, plannedBytes: planned.reduce((sum, file) => sum + file.bytes, 0), planned: planned.map(({ batchId, relative, localPath, bytes, sha256 }) => ({ batchId, relative, localPath, bytes, sha256 })), skipped, deleted: [], deletedBytes: 0, note: "対象はDrive受領確認済みバッチのローカル転送用tarとdownloads内の照合用コピーだけ。元画像・正解JSON・出典・台帳・受領記録・Driveファイルは変更しません。" };
    if (!options.apply) return result;
    for (const item of planned) {
      // Recheck immediately before unlink. Keep a per-file durable audit trail
      // so a later error cannot hide earlier successful local-copy removal.
      await safeFile(dir, item.relative);
      const hashes = await archiveHashes(item.localPath), stat = await lstat(item.localPath);
      if (stat.dev !== item.dev || stat.ino !== item.ino || stat.mtimeMs !== item.mtimeMs || hashes.bytes !== item.bytes || hashes.sha256 !== item.sha256) throw new Error(`削除前に対象が変更されました: ${item.relative}`);
      await unlink(item.localPath);
      const batch = state.batches.find((entry) => entry.id === item.batchId);
      batch.cleanedAt = cleanedAt;
      batch.localCleanup ??= [];
      batch.localCleanup.push({ relative: item.relative, bytes: item.bytes, sha256: item.sha256, cleanedAt });
      await writeJsonAtomic(path.join(dir, "state.json"), state);
      result.deleted.push({ batchId: item.batchId, relative: item.relative, bytes: item.bytes });
      result.deletedBytes += item.bytes;
    }
    await saveQueue(dir, state, { localCleanup: { cleanedAt, deletedBytes: result.deletedBytes, files: result.deleted.length } });
    return result;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { data: { type: "string" }, dataset: { type: "string" }, archive: { type: "string" }, folder: { type: "string" }, "max-batches": { type: "string" }, receipt: { type: "string" }, "downloaded-file": { type: "string" }, apply: { type: "boolean" }, help: { type: "boolean" } } });
  if (values.help) console.log("ローカル準備のみ: node scripts/food-ai/drive-archive.mjs prepare [--dataset commons --data training-data/commons --max-batches 3]\n外部Driveコネクタで実アップロードとメタデータ照合を行った後のみ: node scripts/food-ai/drive-archive.mjs receipt --receipt FILE\n検証済みローカル転送コピーの削除候補のみ表示: node scripts/food-ai/drive-archive.mjs cleanup\n明示的に削除: node scripts/food-ai/drive-archive.mjs cleanup --apply\n既定保存先はfoodDB配下の専用公開学習データフォルダ。100MB/バッチ、合計4TB（予約込み）、PC空き5GBを維持。自動アップロード・元データ削除・認証情報参照はしません。");
  else {
    const options = { dataDir: values.data, dataset: values.dataset, archiveDir: values.archive, folderId: values.folder, downloadedFile: values["downloaded-file"], ...(values["max-batches"] ? { maxBatches: Number(values["max-batches"]) } : {}) };
    const result = positionals[0] === "prepare" ? await prepareArchives(options) : positionals[0] === "receipt" && values.receipt ? await recordReceipt({ ...options, receipt: await readJson(path.resolve(values.receipt)) }) : positionals[0] === "cleanup" ? await cleanupArchives({ ...options, apply: values.apply ?? false }) : (() => { throw new Error("prepare、receipt --receipt FILE、cleanup [--apply]を指定してください"); })();
    console.log(JSON.stringify(result, null, 2));
  }
}
