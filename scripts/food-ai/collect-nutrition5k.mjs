#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, statfs } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { acquireLock, readJson, writeJsonAtomic } from "./agent-utils.mjs";
import { atomicWrite, readBoundedBody, retryDelay } from "./commons-collection.mjs";
import { assertArchivedImage, loadNutritionCache } from "./nutrition5k-cache.mjs";

export const BASE_URL = "https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/";
export const SOURCE = {
  url: "https://github.com/google-research-datasets/Nutrition5k",
  license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  authors: "Quin Thames, Arjun Karpur, Wade Norris, Fangting Xia, Liviu Panait, Tobias Weyand, Jack Sim",
  citation: "Nutrition5k: Towards Automatic Nutritional Understanding of Generic Food. CVPR 2021, pp. 8903–8911.",
  modifications: "Selected overhead RGB images and converted original dish CSV fields to JSON; image bytes unchanged.",
};
const META_FILES = ["metadata/dish_metadata_cafe1.csv", "metadata/dish_metadata_cafe2.csv", "metadata/ingredients_metadata.csv",
  ...["depth_train_ids", "depth_test_ids", "rgb_train_ids", "rgb_test_ids"].map((name) => `dish_ids/splits/${name}.txt`)];
const SAFE_DISH = /^dish_\d{10}$/;
const RESERVE_BYTES = 5_000_000_000;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function parseOptions(args) {
  const options = { output: path.join(root, "training-data/nutrition5k"), maxNew: 1000, maxBytes: 1_000_000_000 };
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (["--output", "--archive"].includes(flag)) {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`${flag} がありません`);
      options[flag === "--output" ? "output" : "archiveDir"] = path.resolve(args[++i]);
    } else if (["--max-new", "--max-bytes"].includes(flag)) {
      const value = Number(args[++i]);
      const maximum = flag === "--max-new" ? 1000 : 1_000_000_000;
      if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${flag} は1〜${maximum}です`);
      options[flag === "--max-new" ? "maxNew" : "maxBytes"] = value;
    } else throw new Error(`不明な引数: ${flag}`);
  }
  if ([root, path.parse(options.output).root].includes(options.output)) throw new Error("専用保存フォルダを指定してください");
  return options;
}

// The official README mentions a count field, but the current published CSV has
// six dish columns followed directly by seven columns per ingredient.
export function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (quoted || field === "") quoted = !quoted;
      else throw new Error("CSV引用符が不正です");
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(field); field = "";
      if (char !== ",") { if (row.some((value) => value !== "")) rows.push(row); row = []; if (char === "\r" && text[i + 1] === "\n") i += 1; }
    } else field += char;
  }
  if (quoted) throw new Error("CSV引用符が閉じていません");
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function parseDishMetadata(text, file) {
  const number = (value) => { const n = Number(value); if (value === "" || !Number.isFinite(n) || n < 0) throw new Error(`${file}: 栄養数値が不正です`); return n; };
  return parseCsv(text).map((row) => {
    if (!SAFE_DISH.test(row[0]) || row.length < 13 || (row.length - 6) % 7 !== 0) throw new Error(`${file}: 未対応の料理CSV形式です`);
    const ingredients = [];
    for (let i = 6; i < row.length; i += 7) {
      if (!/^ingr_\d{10}$/.test(row[i])) throw new Error(`${file}: 材料IDが不正です`);
      // One official row omits an ingredient name. Preserve missingness rather
      // than inventing a food name from the photograph or unrelated catalog.
      ingredients.push({ id: row[i], name: row[i + 1] || null, massGrams: number(row[i + 2]), caloriesKcal: number(row[i + 3]), fatGrams: number(row[i + 4]), carbohydrateGrams: number(row[i + 5]), proteinGrams: number(row[i + 6]) });
    }
    return { dishId: row[0], caloriesKcal: number(row[1]), massGrams: number(row[2]), fatGrams: number(row[3]), carbohydrateGrams: number(row[4]), proteinGrams: number(row[5]), ingredients, metadataFile: file };
  });
}

export function parseSplits(trainText, testText) {
  const parse = (text) => new Set(text.split(/\s+/).filter(Boolean).map((id) => { if (!SAFE_DISH.test(id)) throw new Error("公式split IDが不正です"); return id; }));
  const train = parse(trainText); const test = parse(testText);
  for (const id of train) if (test.has(id)) throw new Error("公式train/testが重複しています");
  return { train, test };
}

export function officialUrl(url) {
  const value = new URL(url);
  return value.origin === "https://storage.googleapis.com" && !value.username && !value.password &&
    (value.pathname.startsWith("/nutrition5k_dataset/nutrition5k_dataset/") || value.pathname === "/storage/v1/b/nutrition5k_dataset/o");
}

export async function download(url, maxBytes, fetchImpl = fetch, wait = sleep) {
  if (!officialUrl(url)) throw new Error("Nutrition5k公式GCS以外には接続しません");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response;
    try { response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "BodyMakeDatasetCollector/1.0 (https://github.com/WaveARGZ/Healthapp)" } }); }
    catch (error) { if (attempt === 3) throw error; await wait(1000 * 2 ** attempt); continue; }
    if (response.ok) return readBoundedBody(response, maxBytes);
    await response.body?.cancel();
    if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
      const duration = retryDelay(response, attempt);
      if (duration > 60_000) throw new Error("長いRetry-Afterのため次回に継続します");
      await wait(duration); continue;
    }
    throw new Error(`公式データ取得失敗 HTTP ${response.status}`);
  }
}

async function regular(file) {
  try { const entry = await lstat(file); if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`通常ファイルではありません: ${file}`); return entry; }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function safeDirectory(directory) {
  await mkdir(directory, { recursive: true });
  let current = path.resolve(directory);
  while (current !== path.parse(current).root) {
    const entry = await lstat(current);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`シンボリックリンク保存先は使えません: ${current}`);
    current = path.dirname(current);
  }
}

async function directoryBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("データ保存先内のシンボリックリンクを除外してください");
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(file);
    else if (entry.isFile()) total += (await lstat(file)).size;
  }
  return total;
}

export async function collectNutrition5k(options, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const wait = dependencies.wait ?? sleep;
  const freeBytes = dependencies.freeBytes ?? (async (directory) => { const info = await statfs(directory); return info.bavail * info.bsize; });
  await safeDirectory(options.output);
  const release = await acquireLock(path.join(options.output, ".nutrition5k.lock.json"));
  if (!release) throw new Error("Nutrition5k収集がすでに動作しています");
  const summary = { schemaVersion: 1, dataset: "nutrition5k", startedAt: new Date().toISOString(), status: "running", added: 0, downloadedBytes: 0, recovered: 0, stopReason: null, errors: [] };
  const files = new Set();
  const metadataHashes = {};
  const capacity = async (incoming = 0) => {
    if (await freeBytes(options.output) < RESERVE_BYTES + incoming + 5_000_000) { summary.stopReason = "local-free-space-reserve"; return false; }
    if (summary.downloadedBytes + incoming > options.maxBytes) { summary.stopReason = "run-byte-budget"; return false; }
    return true;
  };
  try {
    for (const name of ["metadata", "dish_ids/splits", "images", "records"]) await safeDirectory(path.join(options.output, name));
    if (!await capacity(10_000_000)) { summary.status = "stopped"; return summary; }
    const metadata = {};
    for (const relative of META_FILES) {
      const file = path.join(options.output, relative);
      let bytes;
      if (await regular(file)) bytes = await readFile(file);
      else {
        if (!await capacity(5_000_000)) { summary.status = "stopped"; return summary; }
        bytes = await download(`${BASE_URL}${relative}`, 5_000_000, fetchImpl, wait);
        summary.downloadedBytes += bytes.length; await atomicWrite(file, bytes);
      }
      if (bytes.length > 5_000_000) throw new Error("メタデータサイズ上限超過");
      metadata[relative] = bytes.toString("utf8"); metadataHashes[relative] = hash(bytes); files.add(relative);
    }
    const dishes = new Map();
    for (const relative of META_FILES.slice(0, 2)) for (const dish of parseDishMetadata(metadata[relative], relative)) {
      if (dishes.has(dish.dishId)) throw new Error(`料理メタデータ重複: ${dish.dishId}`);
      dishes.set(dish.dishId, dish);
    }
    const splits = Object.fromEntries(["depth", "rgb"].map((kind) => [kind, parseSplits(metadata[`dish_ids/splits/${kind}_train_ids.txt`], metadata[`dish_ids/splits/${kind}_test_ids.txt`])]));
    const stateFile = path.join(options.output, "collection-state.json");
    const state = await readJson(stateFile, { schemaVersion: 1, dataset: "nutrition5k", index: [], pageToken: null, indexComplete: false, metadataHashes });
    if (state.schemaVersion !== 1 || state.dataset !== "nutrition5k" || !Array.isArray(state.index) || typeof state.indexComplete !== "boolean" || (state.pageToken !== null && typeof state.pageToken !== "string")) throw new Error("収集チェックポイントが不正です");
    if (JSON.stringify(state.metadataHashes) !== JSON.stringify(metadataHashes)) throw new Error("メタデータが保存時から変わっています。過去splitを維持して確認してください");
    const validObject = (item) => /^nutrition5k_dataset\/imagery\/realsense_overhead\/dish_\d{10}\/rgb\.png$/.test(item.name) && Number.isSafeInteger(item.bytes) && item.bytes > 0 && item.bytes <= 5_000_000;
    if (state.index.some((item) => !validObject(item))) throw new Error("保存済み画像索引が不正です");
    for (let page = 0; !state.indexComplete && page < 20; page += 1) {
      const query = new URLSearchParams({ prefix: "nutrition5k_dataset/imagery/realsense_overhead/", maxResults: "1000", fields: "items(name,size),nextPageToken" });
      if (state.pageToken) query.set("pageToken", state.pageToken);
      if (!await capacity(1_000_000)) { summary.status = "stopped"; return summary; }
      const data = await download(`https://storage.googleapis.com/storage/v1/b/nutrition5k_dataset/o?${query}`, 1_000_000, fetchImpl, wait);
      summary.downloadedBytes += data.length;
      const listing = JSON.parse(data.toString("utf8"));
      if (!Array.isArray(listing.items) || (listing.nextPageToken && typeof listing.nextPageToken !== "string")) throw new Error("公式画像索引の形式が不正です");
      const seen = new Set(state.index.map((item) => item.name));
      for (const item of listing.items) if (item.name?.endsWith("/rgb.png")) {
        const record = { name: item.name, bytes: Number(item.size) };
        if (!validObject(record)) throw new Error("公式画像索引の画像パス/サイズが不正です");
        if (!seen.has(record.name)) { state.index.push(record); seen.add(record.name); }
      }
      if (state.pageToken && listing.nextPageToken === state.pageToken) throw new Error("ページ継続キーが進みません");
      state.pageToken = listing.nextPageToken ?? null; state.indexComplete = !state.pageToken;
      await writeJsonAtomic(stateFile, state); await wait(100);
    }
    if (!state.indexComplete) { summary.stopReason = "index-page-budget"; summary.status = "stopped"; return summary; }
    const archivedImages = await loadNutritionCache(options.output, { archiveDir: options.archiveDir });
    if (await regular(path.join(options.output, "archive-cache-index.json"))) files.add("archive-cache-index.json");
    summary.archivedImages = 0;
    const sourceFile = "attribution.json";
    await writeJsonAtomic(path.join(options.output, sourceFile), { schemaVersion: 1, dataset: "nutrition5k", ...SOURCE, metadataHashes, retrievedAt: summary.startedAt }); files.add(sourceFile);
    const existing = new Set();
    // Recover transactions safely and verify existing content before archiving.
    for (const name of await readdir(path.join(options.output, "records"))) {
      if (!/^nutrition5k-dish_\d{10}\.json$/.test(name)) throw new Error(`未管理レコードは上書きしません: ${name}`);
      const relative = `records/${name}`; await regular(path.join(options.output, relative));
      const record = await readJson(path.join(options.output, relative));
      const expectedImage = `images/${name.replace(/\.json$/, ".png")}`;
      if (record.dataset !== "nutrition5k" || record.imageFile !== expectedImage || !SAFE_DISH.test(record.dishId) || record.id !== name.slice(0, -5) || !/^[a-f0-9]{64}$/.test(record.imageSha256 ?? "")) throw new Error(`保存レコードが不正です: ${name}`);
      const expectedDish = dishes.get(record.dishId);
      const expectedSplit = Object.fromEntries(Object.entries(splits).map(([kind, values]) => [kind, values.train.has(record.dishId) ? "train" : values.test.has(record.dishId) ? "test" : "unassigned"]));
      if (!expectedDish || JSON.stringify(record.nutrition) !== JSON.stringify(expectedDish) || JSON.stringify(record.officialSplit) !== JSON.stringify(expectedSplit) ||
          record.source?.license !== SOURCE.license || record.source?.metadataSha256 !== metadataHashes[expectedDish.metadataFile] ||
          record.source?.imageUrl !== `${BASE_URL}imagery/realsense_overhead/${record.dishId}/rgb.png` ||
          record.classificationLabel !== null || record.labelOrigin !== "dataset-provided-nutrition-metadata") throw new Error(`保存栄養値/出典/splitが元データと一致しません: ${name}`);
      const localImage = await regular(path.join(options.output, expectedImage));
      if (localImage) {
        if (hash(await readFile(path.join(options.output, expectedImage))) !== record.imageSha256 || localImage.size !== record.imageBytes) throw new Error(`保存画像のハッシュ/サイズが一致しません: ${name}`);
        files.add(expectedImage);
      } else {
        assertArchivedImage(record, archivedImages);
        summary.archivedImages += 1;
      }
      files.add(relative); existing.add(record.dishId);
    }
    for (const item of state.index) {
      const dishId = item.name.split("/")[3];
      if (existing.has(dishId)) continue;
      const dish = dishes.get(dishId);
      if (!dish) throw new Error(`公式栄養データがない画像: ${dishId}`);
      const officialSplit = Object.fromEntries(Object.entries(splits).map(([kind, values]) => [kind, values.train.has(dishId) ? "train" : values.test.has(dishId) ? "test" : "unassigned"]));
      if (summary.added >= options.maxNew) { summary.stopReason = "max-new"; break; }
      if (!await capacity(item.bytes + 20_000)) break;
      const id = `nutrition5k-${dishId}`; const imageFile = `images/${id}.png`; const recordFile = `records/${id}.json`;
      const imagePath = path.join(options.output, imageFile); let imageBytes;
      if (await regular(imagePath)) { imageBytes = await readFile(imagePath); summary.recovered += 1; }
      else { imageBytes = await download(`https://storage.googleapis.com/nutrition5k_dataset/${item.name}`, Math.min(5_000_000, item.bytes), fetchImpl, wait); summary.downloadedBytes += imageBytes.length; }
      if (imageBytes.length !== item.bytes) throw new Error(`画像の公表サイズ不一致: ${dishId}`);
      const image = await sharp(imageBytes, { limitInputPixels: 20_000_000 }).metadata();
      if (image.format !== "png" || image.width < 32 || image.height < 32 || image.channels < 3) throw new Error(`RGB画像ではありません: ${dishId}`);
      await sharp(imageBytes, { limitInputPixels: 20_000_000 }).stats(); // Decode pixels, not just the PNG header.
      const record = {
        schemaVersion: 1, dataset: "nutrition5k", id, dishId, imageFile, imageSha256: hash(imageBytes), imageBytes: imageBytes.length,
        labelOrigin: "dataset-provided-nutrition-metadata", labelVerified: false, classificationLabel: null,
        note: "提供元による計量・栄養データ。BodyMakeの27料理正解や人間による個別検証と混同しない。モデルの予測値ではない。",
        nutrition: dish, officialSplit, splitPolicy: "Keep every incremental scan of a plate in its official split; never random-split video frames or overwrite official assignments.",
        trainingEligibility: officialSplit.depth === "unassigned" ? "quarantined-no-official-overhead-split" : "nutrition-task-only-with-official-split",
        dataQualityWarnings: [
          ...(officialSplit.depth === "unassigned" ? ["Official overhead split does not assign this dish; retain but do not train/evaluate until assignment is reviewed."] : []),
          ...(dish.ingredients.some((ingredient) => ingredient.name === null) ? ["One or more ingredient names are absent in the original metadata; preserved as null."] : []),
        ],
        source: { ...SOURCE, imageUrl: `https://storage.googleapis.com/nutrition5k_dataset/${item.name}`, metadataUrl: `${BASE_URL}${dish.metadataFile}`, metadataSha256: metadataHashes[dish.metadataFile] },
        collectedAt: new Date().toISOString(),
      };
      if (!await regular(imagePath)) await atomicWrite(imagePath, imageBytes);
      await writeJsonAtomic(path.join(options.output, recordFile), record);
      files.add(imageFile); files.add(recordFile); existing.add(dishId); summary.added += 1;
      if (summary.added % 50 === 0) console.log(`Nutrition5k: 今回${summary.added}/${options.maxNew}枚、合計${existing.size}枚`);
      await wait(30);
    }
    summary.total = existing.size; summary.metadataDishCount = dishes.size; summary.availableOverheadImages = state.index.length;
    summary.totalBytes = await directoryBytes(options.output);
    summary.status = "completed"; summary.stopReason ??= "overhead-source-exhausted";
    await writeJsonAtomic(path.join(options.output, "archive-source.json"), { schemaVersion: 1, dataset: "nutrition5k", publicSource: SOURCE, files: [...files].sort() });
    return summary;
  } catch (error) { summary.status = "failed"; summary.errors.push(error.message); throw error; }
  finally {
    summary.finishedAt = new Date().toISOString();
    try { await writeJsonAtomic(path.join(options.output, "collection-summary.json"), summary); } finally { await release(); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--help")) console.log("node scripts/food-ai/collect-nutrition5k.mjs [--max-new 1000] [--max-bytes 1000000000] [--output DIR] [--archive ml/artifacts/drive-archive] — 公式の真上RGBのみ。5GB空き容量を残し、公式splitと栄養データを保存。商用利用可能CC BY4.0。料理名分類学習への自動混合はしません。退避済み画像は復元索引と完全再取得済みDrive台帳の両方を確認し再取得しません。");
  else {
    try { console.log(JSON.stringify(await collectNutrition5k(parseOptions(process.argv.slice(2))), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
