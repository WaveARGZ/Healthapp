#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline, RawImage } from "@huggingface/transformers";
import { evaluate, shouldPromote, trainCalibration } from "./calibration-training.mjs";
import { FOOD_BASE_MODEL } from "../../lib/food-ai/food-calibration.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const labels = JSON.parse(await readFile(path.join(root, "lib/food-ai/photo-labels.json"), "utf8"));
const labelIds = labels.map(([id]) => id);
const artifactDir = path.join(root, "ml/artifacts");
const deploymentFile = path.join(root, "lib/food-ai/deployed-calibration.json");
const args = process.argv.slice(2);
const dataIndex = args.indexOf("--data");
const dataDir = dataIndex >= 0 && args[dataIndex + 1] ? path.resolve(args[dataIndex + 1]) : null;
const prepareOnly = args.includes("--prepare-only");
const promote = args.includes("--promote");
const allowUnreviewed = args.includes("--allow-unreviewed");

if (args.includes("--help") || !dataDir) {
  console.log("使い方: npm run food-ai:learn -- --data /写真とJSONのあるフォルダ [--prepare-only] [--allow-unreviewed] [--promote]");
  console.log("--prepare-only: 写真と正解データの検査だけ行います。--promote: 未使用テストデータの改善条件を満たした場合だけアプリに反映します。");
  process.exit(args.includes("--help") ? 0 : 1);
}
if (!existsSync(dataDir)) throw new Error(`学習データフォルダがありません: ${dataDir}`);
if (path.resolve(dataDir) === root) throw new Error("プロジェクト直下をデータフォルダにしないでください");
if (allowUnreviewed && promote) throw new Error("仮ラベルの写真から作ったモデルはアプリに反映できません");
await mkdir(artifactDir, { recursive: true });

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
function fingerprint(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function shortHash(value) {
  return createHash("sha256").update(value).digest("hex");
}
function hamming(a, b) {
  let bits = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (bits) { bits &= bits - 1n; count += 1; }
  return count;
}
async function differenceHash(image) {
  const small = await image.resize(9, 8);
  let bits = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const offset = (y * 9 + x) * small.channels;
      const next = offset + small.channels;
      const gray = (at) => 0.299 * small.data[at] + 0.587 * small.data[at + 1] + 0.114 * small.data[at + 2];
      bits = (bits << 1n) | BigInt(gray(offset) > gray(next));
    }
  }
  return bits.toString(16).padStart(16, "0");
}

const entries = await readdir(dataDir, { withFileTypes: true });
const jsonNames = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "sources.json").map((entry) => entry.name).sort();
const imageNames = new Set(entries.filter((entry) => entry.isFile() && /\.(jpe?g|png)$/i.test(entry.name)).map((entry) => entry.name));
const review = [];
const valid = [];
for (const name of jsonNames) {
  const id = name.slice(0, -5);
  const imageName = [`${id}.jpg`, `${id}.jpeg`, `${id}.png`].find((candidate) => imageNames.has(candidate));
  if (!imageName) { review.push([id, "写真がない", "", ""]); continue; }
  imageNames.delete(imageName);
  try {
    const record = JSON.parse(await readFile(path.join(dataDir, name), "utf8"));
    if (record.schemaVersion !== 1 || record.id !== id || !record.confirmedFoodName || typeof record.confirmedFoodName !== "string") {
      throw new Error("正解データの形式が不正");
    }
    if (!labelIds.includes(record.confirmedFoodId)) {
      review.push([id, "27種類以外の料理。対応ラベル追加または手動分類が必要", record.confirmedFoodName, record.confirmedFoodId]);
      continue;
    }
    if (record.labelVerified === false && !allowUnreviewed) {
      review.push([id, "カテゴリ由来の仮ラベル。画像と料理名を確認してください", record.confirmedFoodName, record.confirmedFoodId]);
      continue;
    }
    const bytes = await readFile(path.join(dataDir, imageName));
    const mime = imageName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const image = await RawImage.read(new Blob([bytes], { type: mime }));
    if (image.width < 32 || image.height < 32 || image.channels < 3) throw new Error("写真が小さすぎるか読み込めない");
    valid.push({ id, imageName, label: record.confirmedFoodId, hash: fingerprint(bytes), dhash: await differenceHash(image) });
  } catch (error) {
    review.push([id, `破損または不正: ${error.message}`, "", ""]);
  }
}
for (const imageName of imageNames) review.push([imageName, "正解JSONがない", "", ""]);

// Keep copies of the same or nearly identical image in one split. Conflicting
// labels are not used until a person resolves them.
const parent = valid.map((_, index) => index);
function find(index) { return parent[index] === index ? index : (parent[index] = find(parent[index])); }
function unite(a, b) { parent[find(b)] = find(a); }
for (let i = 0; i < valid.length; i += 1) {
  for (let j = i + 1; j < valid.length; j += 1) {
    if (valid[i].hash === valid[j].hash || hamming(valid[i].dhash, valid[j].dhash) <= 4) unite(i, j);
  }
}
const grouped = new Map();
valid.forEach((item, index) => {
  const key = find(index);
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(item);
});
const unique = [];
for (const group of grouped.values()) {
  if (new Set(group.map((item) => item.label)).size !== 1) {
    for (const item of group) review.push([item.id, "同一・近似写真に異なる正解ラベル", item.label, ""]);
    continue;
  }
  unique.push(group.sort((a, b) => a.id.localeCompare(b.id))[0]);
}
const counts = new Map();
for (const item of unique) counts.set(item.label, (counts.get(item.label) ?? 0) + 1);
const approved = unique.filter((item) => {
  if (counts.get(item.label) >= 5) return true;
  review.push([item.id, "同料理の独立した写真が5枚未満", item.label, ""]);
  return false;
});
await writeFile(path.join(artifactDir, "review.csv"),
  [["ファイルID", "要確認の理由", "料理名またはID", "元のID"], ...review].map((row) => row.map(csvCell).join(",")).join("\n") + "\n");
console.log(`検査: JSON ${jsonNames.length}件、独立写真 ${unique.length}件、学習対象 ${approved.length}件、要確認 ${review.length}件`);
console.log(`要確認一覧: ${path.join(artifactDir, "review.csv")}`);
if (prepareOnly) process.exit(0);
if (approved.length < 100 || new Set(approved.map((item) => item.label)).size < 5) {
  throw new Error("学習開始には、少なくとも100枚の独立した確認済み写真と5種類以上の料理が必要です。先にreview.csvを確認してください。");
}

const byLabel = new Map();
for (const item of approved) {
  if (!byLabel.has(item.label)) byLabel.set(item.label, []);
  byLabel.get(item.label).push(item);
}
const splits = { train: [], validation: [], test: [] };
for (const items of byLabel.values()) {
  items.sort((a, b) => shortHash(a.hash).localeCompare(shortHash(b.hash)));
  const testCount = Math.max(1, Math.round(items.length * 0.15));
  const validationCount = Math.max(1, Math.round(items.length * 0.15));
  splits.test.push(...items.slice(0, testCount));
  splits.validation.push(...items.slice(testCount, testCount + validationCount));
  splits.train.push(...items.slice(testCount + validationCount));
}
if (splits.test.length < 15 || splits.validation.length < 15) throw new Error("検証用・テスト用の写真が各15枚以上必要です");

const cacheFile = path.join(artifactDir, "clip-score-cache.json");
let cache = {};
try { cache = JSON.parse(await readFile(cacheFile, "utf8")); } catch { /* first run */ }
const cacheVersion = shortHash(JSON.stringify({ base: FOOD_BASE_MODEL, dtype: "q4", labels }));
console.log("CLIPモデルを読み込みます。初回はモデルファイルのダウンロードに時間がかかります。");
const classifier = await pipeline("zero-shot-image-classification", FOOD_BASE_MODEL, { dtype: "q4" });
const scored = {};
for (const [splitName, items] of Object.entries(splits)) {
  scored[splitName] = [];
  for (const item of items) {
    const key = `${cacheVersion}:${item.hash}`;
    let scores = cache[key];
    if (!Array.isArray(scores) || scores.length !== labels.length || scores.some((score) => !Number.isFinite(score))) {
      const bytes = await readFile(path.join(dataDir, item.imageName));
      const mime = item.imageName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      const results = await classifier(new Blob([bytes], { type: mime }), labels.map(([, prompt]) => prompt));
      const lookup = new Map(results.map((result) => [result.label, result.score]));
      scores = labels.map(([, prompt]) => lookup.get(prompt) ?? 0);
      cache[key] = scores;
      await writeFile(cacheFile, JSON.stringify(cache));
    }
    scored[splitName].push({ label: item.label, scores });
  }
  console.log(`${splitName}: ${items.length}件のスコアを取得`);
}

const validationBaseline = evaluate(scored.validation, labelIds);
const candidates = [0.01, 0.03, 0.1, 0.3].map((regularization) => {
  const model = trainCalibration(scored.train, labelIds, regularization);
  return { regularization, model, validation: evaluate(scored.validation, labelIds, model) };
});
candidates.sort((a, b) => b.validation.top1 - a.validation.top1 || b.validation.top5 - a.validation.top5);
const best = candidates[0];
// Do not inspect the test split until training parameters have been selected.
const testBaseline = evaluate(scored.test, labelIds);
const testTrained = evaluate(scored.test, labelIds, best.model);
const validationPassed = best.validation.top1 > validationBaseline.top1 && best.validation.top5 >= validationBaseline.top5;
const coveragePassed = labelIds.every((id) => (counts.get(id) ?? 0) >= 10);
const promotionPassed = coveragePassed && validationPassed && shouldPromote(testBaseline, testTrained);
const report = {
  createdAt: new Date().toISOString(), baseModel: FOOD_BASE_MODEL,
  scope: "27種類の料理候補に対するCLIP出力の補正。量とPFCは写真から学習していません。",
  inspectedRecords: jsonNames.length, independentImages: unique.length, reviewCount: review.length,
  splits: Object.fromEntries(Object.entries(splits).map(([key, items]) => [key, items.length])),
  chosenRegularization: best.regularization,
  validation: { baseline: validationBaseline, trained: best.validation },
  test: { baseline: testBaseline, trained: testTrained },
  coveragePassed, promotionPassed,
};
await writeFile(path.join(artifactDir, "evaluation.json"), JSON.stringify(report, null, 2) + "\n");
await writeFile(path.join(artifactDir, "candidate-calibration.json"), JSON.stringify(best.model, null, 2) + "\n");
console.log(`未使用テスト: 正解率 ${testBaseline.top1}/${testBaseline.total} → ${testTrained.top1}/${testTrained.total}、上位5件 ${testBaseline.top5} → ${testTrained.top5}`);
console.log(`反映条件: ${promotionPassed ? "合格" : "未達"}。詳細: ${path.join(artifactDir, "evaluation.json")}`);
if (promote && promotionPassed) {
  await writeFile(deploymentFile, JSON.stringify(best.model, null, 2) + "\n");
  console.log(`アプリ用モデルを更新: ${deploymentFile}`);
} else if (promote) {
  console.log("精度改善条件を満たさなかったため、アプリ用モデルは変更しません。");
}
