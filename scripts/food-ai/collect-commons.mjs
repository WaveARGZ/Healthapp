#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RawImage } from "@huggingface/transformers";
import { COMMONS_QUERIES, COMMONS_SOURCES } from "./commons-sources.mjs";
import { acquireLock } from "./agent-utils.mjs";
import {
  MAX_IMAGE_BYTES, DownloadLimitError, atomicJson, atomicWrite, candidateFromPage,
  delay, inspectDiskBudget, parseOptions, queryUrl, readJson, requestWithRetry, validateCheckpoint, validateManifest,
} from "./commons-collection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("使い方: npm run food-ai:collect -- [--labels ID,ID] [--per-label 200] [--max-new 30] [--max-bytes 1000000000] [--min-free-bytes 5000000000] [--output DIR]");
  console.log(`CommonsのCC0・CC BY・Public domain写真を出典付きで収集。既定は全${COMMONS_SOURCES.length}種、1回30枚、保存先全体約1GBまで。PCの空き容量を最低5GB残します。カテゴリ/検索由来の仮ラベルは正解扱いしません。`);
  console.log(`--labels で対象を限定できます。料理ID: ${COMMONS_SOURCES.map(({ id }) => id).join(",")}`);
  process.exit(0);
}
const options = parseOptions(args, path.join(root, "training-data/commons"));
const queries = COMMONS_QUERIES.filter(({ labelId }) => !options.labels || options.labels.includes(labelId));
if ([root, path.parse(options.output).root].includes(path.resolve(options.output))) throw new Error("専用の学習データフォルダを指定してください");
await mkdir(options.output, { recursive: true });
const lockFile = path.join(options.output, ".collection.lock");
const release = await acquireLock(lockFile);
if (!release) throw new Error(`別の収集が動作中です: ${lockFile}`);

async function directoryBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(file);
    else if (entry.isFile()) total += (await stat(file)).size;
  }
  return total;
}

const startedAt = new Date().toISOString();
const summary = { schemaVersion: 1, startedAt, output: options.output, options, status: "running", added: 0, recovered: 0, skipped: {}, apiRequests: 0, errors: [], labelCounts: {} };
const skip = (reason) => { summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1; };
try {
  const manifestFile = path.join(options.output, "sources.json");
  const stateFile = path.join(options.output, "collection-state.json");
  const manifest = validateManifest(await readJson(manifestFile, []));
  const state = validateCheckpoint(await readJson(stateFile, { schemaVersion: 1, queries: {} }));
  const savedIds = new Set(manifest.map((item) => item.id));
  const savedHashes = new Set(manifest.map((item) => item.sha256));
  // Recover a completed image + sidecar transaction if the process stopped
  // before sources.json was renamed. Never rewrite a human-reviewed sidecar.
  for (const entry of await readdir(options.output)) {
    if (!/^commons-\d+\.json$/.test(entry) || savedIds.has(entry.slice(0, -5))) continue;
    const record = await readJson(path.join(options.output, entry), null);
    const credit = record?.source;
    if (!credit || credit.id !== record.id || !/^commons-\d+\.(?:jpg|png)$/.test(credit.imageFile ?? "") || !credit.imageFile.startsWith(`${record.id}.`)) continue;
    validateManifest([credit]);
    const bytes = await readFile(path.join(options.output, credit.imageFile));
    if (createHash("sha256").update(bytes).digest("hex") !== credit.sha256) throw new Error(`${entry} の写真ハッシュが一致しません`);
    manifest.push(credit);
    savedIds.add(credit.id);
    savedHashes.add(credit.sha256);
    summary.recovered += 1;
  }
  if (summary.recovered) await atomicJson(manifestFile, manifest);
  const counts = new Map(COMMONS_SOURCES.map((source) => [source.id, manifest.filter((item) => item.labelId === source.id).length]));
  const sources = new Map(COMMONS_SOURCES.map((source) => [source.id, source]));
  const pageCounts = new Map();
  const labelRequests = new Map();
  const inactive = new Set();
  const now = Date.now();
  for (const query of queries) {
    const previous = state.queries[query.key];
    // Exhausted searches get a fresh scan after a day; IDs/hashes in the
    // manifest prevent downloading a previously saved photograph again.
    if (!previous || (previous.complete && previous.pending.length === 0 && now - Date.parse(previous.completedAt ?? startedAt) >= 86_400_000)) {
      state.queries[query.key] = { continuation: {}, pending: [], complete: false };
    }
  }
  let totalBytes = await directoryBytes(options.output);
  let stopReason = "sources-exhausted";
  async function hasDiskBudget(requiredBytes) {
    summary.diskSpace = await inspectDiskBudget(options.output, { reserveBytes: options.minFreeBytes, requiredBytes });
    if (!summary.diskSpace.sufficient) stopReason = "disk-reserve";
    return summary.diskSpace.sufficient;
  }
  while (summary.added < options.maxNew) {
    if (totalBytes >= options.maxBytes - 1_000_000) { stopReason = "byte-budget"; break; }
    // Leave room for the next bounded image and atomic checkpoint/manifest
    // replacements before even issuing a download request.
    const metadataBudget = Buffer.byteLength(JSON.stringify(manifest, null, 2)) + Buffer.byteLength(JSON.stringify(state, null, 2)) + 1_000_000;
    if (!await hasDiskBudget(MAX_IMAGE_BYTES + metadataBudget)) break;
    const available = queries.filter((query) => {
      const entry = state.queries[query.key];
      return counts.get(query.labelId) < options.perLabel && !inactive.has(query.key) && (entry.pending.length > 0 || !entry.complete);
    }).sort((a, b) => counts.get(a.labelId) - counts.get(b.labelId) || (labelRequests.get(a.labelId) ?? 0) - (labelRequests.get(b.labelId) ?? 0));
    if (!available.length) break;
    const query = available[0];
    const entry = state.queries[query.key];
    if (!entry.pending.length) {
      if (summary.apiRequests >= 108) { stopReason = "request-budget"; break; }
      if ((pageCounts.get(query.key) ?? 0) >= 4) { inactive.add(query.key); continue; }
      await delay(500);
      const batch = await requestWithRetry(queryUrl(query, entry.continuation), { json: true });
      summary.apiRequests += 1;
      pageCounts.set(query.key, (pageCounts.get(query.key) ?? 0) + 1);
      labelRequests.set(query.labelId, (labelRequests.get(query.labelId) ?? 0) + 1);
      entry.pending = Object.values(batch.query?.pages ?? {});
      entry.continuation = batch.continue ?? {};
      entry.complete = !batch.continue;
      if (entry.complete) entry.completedAt = new Date().toISOString();
      validateCheckpoint(state);
      await atomicJson(stateFile, state);
      if (!entry.pending.length) continue;
    }
    const page = entry.pending[0];
    const candidate = candidateFromPage(page, sources.get(query.labelId), query);
    if (!candidate) skip("metadata-or-license");
    else if (savedIds.has(candidate.id)) skip("existing-id");
    else {
      const imageFile = `${candidate.id}.${candidate.extension}`;
      const imagePath = path.join(options.output, imageFile);
      let exists = false;
      for (const extension of ["jpg", "png", "json"]) {
        try { await stat(path.join(options.output, `${candidate.id}.${extension}`)); exists = true; }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      if (exists) skip("orphan-preserved");
      else {
        if (!await hasDiskBudget(MAX_IMAGE_BYTES + metadataBudget)) break;
        let bytes;
        try {
          await delay(500);
          bytes = await requestWithRetry(candidate.sourceUrl, { maxBytes: Math.min(MAX_IMAGE_BYTES, options.maxBytes - totalBytes - 1_000_000) });
        } catch (error) {
          if (error instanceof DownloadLimitError || error.permanent) { skip("download-rejected"); }
          else throw error; // Pending candidate is retained for the next run.
        }
        if (bytes) {
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          if (savedHashes.has(sha256)) skip("duplicate-bytes");
          else {
            let image;
            try { image = await RawImage.read(new Blob([bytes], { type: candidate.mime })); }
            catch { skip("invalid-image"); }
            if (image && (image.width < 160 || image.height < 160 || image.width * image.height > 20_000_000 || image.channels < 3)) { skip("image-dimensions"); image = null; }
            if (image) {
              const credit = { ...candidate, imageFile, sha256, bytes: bytes.length, retrievedAt: new Date().toISOString() };
              const record = {
                schemaVersion: 1, id: candidate.id, confirmedFoodId: query.labelId,
                confirmedFoodName: sources.get(query.labelId).name, labelVerified: false,
                labelOrigin: `Wikimedia Commons ${query.kind}:${query.value}`, createdAt: credit.retrievedAt,
                source: credit,
              };
              const recordBytes = Buffer.byteLength(JSON.stringify(record, null, 2)) + 1;
              const manifestBytes = Buffer.byteLength(JSON.stringify([...manifest, credit], null, 2)) + 1;
              totalBytes = await directoryBytes(options.output);
              if (totalBytes + bytes.length + recordBytes + manifestBytes + 250_000 > options.maxBytes) { stopReason = "byte-budget"; break; }
              if (!await hasDiskBudget(bytes.length + recordBytes + manifestBytes + metadataBudget)) break;
              await atomicWrite(imagePath, bytes);
              await atomicJson(path.join(options.output, `${candidate.id}.json`), record);
              manifest.push(credit);
              await atomicJson(manifestFile, manifest);
              savedIds.add(candidate.id);
              savedHashes.add(sha256);
              counts.set(query.labelId, counts.get(query.labelId) + 1);
              summary.added += 1;
              console.log(`${sources.get(query.labelId).name}: ${counts.get(query.labelId)}/${options.perLabel}枚（今回 ${summary.added}/${options.maxNew}枚）`);
              totalBytes = await directoryBytes(options.output);
            }
          }
        }
      }
    }
    entry.pending.shift();
    await atomicJson(stateFile, state);
  }
  if (summary.added >= options.maxNew) stopReason = "max-new";
  summary.status = "completed";
  summary.stopReason = stopReason;
  summary.total = manifest.length;
  summary.labelCounts = Object.fromEntries(counts);
  summary.totalBytes = await directoryBytes(options.output);
  summary.labelVerified = false;
  await atomicJson(stateFile, state);
} catch (error) {
  summary.status = "failed";
  summary.errors.push(error.message);
  process.exitCode = 1;
  console.error(error.message);
} finally {
  summary.finishedAt = new Date().toISOString();
  try { await atomicJson(path.join(options.output, "collection-summary.json"), summary); }
  finally { await release(); }
}
console.log(`保存先: ${options.output}。料理名は仮ラベルです。出典: sources.json / 実行結果: collection-summary.json`);
