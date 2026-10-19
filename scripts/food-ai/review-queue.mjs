#!/usr/bin/env node
import { mkdir, readdir, realpath, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { fileHash, readJson, writeJsonAtomic } from "./agent-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const validId = (id) => typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(id);

export async function reviewLabels() {
  const [labels, library] = await Promise.all([
    readJson(path.join(root, "lib/food-ai/test-photo-labels.json")),
    readJson(path.join(root, "lib/data/food-library.json")),
  ]);
  const names = new Map(library.foods.map((food) => [food.id, food.name]));
  return new Map(labels.map(([id]) => {
    if (!names.has(id)) throw new Error(`食品名が見つかりません: ${id}`);
    return [id, names.get(id)];
  }));
}

export function completedReview(record, imageSha256) {
  const review = record.review;
  if (!review || !["human", "visual-agent"].includes(review.method) ||
    typeof review.reviewer !== "string" || !review.reviewer.trim() ||
    !Number.isFinite(Date.parse(review.reviewedAt)) || review.imageSha256 !== imageSha256) return null;
  if (record.labelVerified === false && review.decision === "rejected") return "rejected";
  if (record.labelVerified === true && [undefined, "accepted"].includes(review.decision) &&
    (review.foodId === undefined || review.foodId === record.confirmedFoodId)) return "accepted";
  return null;
}

// Only flat, ordinary files are eligible. Neither metadata IDs nor symlinks can
// redirect review operations outside this dataset.
export async function loadReviewRecords(dataDir) {
  const directory = await realpath(path.resolve(dataDir));
  const entries = await readdir(directory, { withFileTypes: true });
  const images = new Map();
  const issues = [];
  for (const entry of entries) {
    if (!/\.(jpe?g|png)$/i.test(entry.name)) continue;
    const id = entry.name.replace(/\.[^.]+$/, "");
    if (!entry.isFile() || !validId(id)) { issues.push({ file: entry.name, reason: "通常の画像ファイルではありません" }); continue; }
    if (!images.has(id)) images.set(id, []);
    images.get(id).push(path.join(directory, entry.name));
  }
  const records = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.name.endsWith(".json") || ["sources.json", "collection-summary.json", "collection-state.json", "collect-state.json"].includes(entry.name)) continue;
    const id = entry.name.slice(0, -5);
    if (!entry.isFile() || !validId(id)) { issues.push({ file: entry.name, reason: "通常のメタデータファイルではありません" }); continue; }
    try {
      const metadataPath = path.join(directory, entry.name);
      const metadata = await readJson(metadataPath);
      if (!metadata || metadata.schemaVersion !== 1 || metadata.id !== id) throw new Error("メタデータとファイルIDが一致しません");
      const candidates = images.get(id) ?? [];
      if (candidates.length !== 1) throw new Error(candidates.length ? "同じIDに複数の画像があります" : "対応する画像がありません");
      const imagePath = candidates[0];
      records.push({ id, imagePath, metadataPath, metadata, imageSha256: await fileHash(imagePath) });
    } catch (error) { issues.push({ file: entry.name, reason: error.message }); }
  }
  return { directory, records, issues };
}

export function prioritizePending(records, labels) {
  const acceptedCounts = Object.fromEntries([...labels.keys()].map((id) => [id, 0]));
  const groups = new Map();
  let skippedReviewedCount = 0;
  for (const item of records) {
    const completed = completedReview(item.metadata, item.imageSha256);
    if (completed === "rejected" || (completed === "accepted" && labels.has(item.metadata.confirmedFoodId))) {
      skippedReviewedCount += 1;
      if (completed === "accepted") acceptedCounts[item.metadata.confirmedFoodId] += 1;
      continue;
    }
    const label = item.metadata.confirmedFoodId ?? "unmapped";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  }
  for (const items of groups.values()) items.sort((a, b) => a.id.localeCompare(b.id));
  const order = [...groups.keys()].sort((a, b) => (acceptedCounts[a] ?? 0) - (acceptedCounts[b] ?? 0) || a.localeCompare(b));
  const pending = [];
  // A single populous class must not fill the whole review batch.
  while (order.some((label) => groups.get(label).length)) {
    for (const label of order) {
      const next = groups.get(label).shift();
      if (next) pending.push(next);
    }
  }
  return { pending, acceptedCounts, skippedReviewedCount };
}

export async function buildReviewQueue({ dataDir, outputDir, limit = 24 }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 240) throw new Error("--limit は1〜240の整数にしてください");
  const labels = await reviewLabels();
  const { directory, records, issues } = await loadReviewRecords(dataDir);
  const { pending, acceptedCounts, skippedReviewedCount } = prioritizePending(records, labels);
  const destination = path.resolve(outputDir);
  await mkdir(destination, { recursive: true });
  const { RawImage } = await import("@huggingface/transformers");
  const prepared = [];
  for (const item of pending) {
    if (prepared.length >= limit) break;
    try {
      const picture = await RawImage.read(item.imagePath);
      const thumbnail = await picture.toSharp().resize(256, 250, { fit: "contain", background: "#ffffff" }).png().toBuffer();
      if (await fileHash(item.imagePath) !== item.imageSha256) throw new Error("一覧作成中に画像が変更されました");
      prepared.push({ item, thumbnail });
    } catch (error) { issues.push({ file: path.basename(item.imagePath), reason: `画像を表示できません: ${error.message}` }); }
  }
  const items = [];
  const sheets = [];
  const cellWidth = 280, cellHeight = 300;
  for (let start = 0; start < prepared.length; start += 12) {
    const sheetPath = path.join(destination, `sheet-${String(sheets.length + 1).padStart(4, "0")}.png`);
    const composites = [];
    for (let slot = 0; slot < 12 && start + slot < prepared.length; slot += 1) {
      const { item, thumbnail } = prepared[start + slot];
      const index = start + slot + 1;
      const left = (slot % 4) * cellWidth, top = Math.floor(slot / 4) * cellHeight;
      composites.push({ input: thumbnail, left: left + 12, top: top + 8 });
      // IDs are restricted to ASCII. Deliberately do not print proposed labels.
      const caption = `<svg width="280" height="34"><rect width="280" height="34" fill="white"/><text x="10" y="23" font-size="14" fill="black">${index}. ${item.id}</text></svg>`;
      composites.push({ input: Buffer.from(caption), left, top: top + 262 });
      items.push({ index, id: item.id, imagePath: item.imagePath, metadataPath: item.metadataPath,
        imageSha256: item.imageSha256, proposedLabel: { id: item.metadata.confirmedFoodId ?? null,
          name: labels.get(item.metadata.confirmedFoodId) ?? item.metadata.confirmedFoodName ?? null }, sheetPath });
    }
    const background = new RawImage(new Uint8Array(1120 * 900 * 3).fill(245), 1120, 900, 3);
    const temporary = `${sheetPath}.${randomUUID()}.tmp`;
    await background.toSharp().composite(composites).png().toFile(temporary);
    await rename(temporary, sheetPath);
    sheets.push(sheetPath);
  }
  const queue = { schemaVersion: 1, generatedAt: new Date().toISOString(), dataDir: directory, limit,
    instructions: "画像を目視確認してから判定してください。proposedLabelは未確認候補であり正解ではありません。",
    totalPending: pending.length, skippedReviewedCount, acceptedCounts, items, sheets, issues };
  await writeJsonAtomic(path.join(destination, "queue.json"), queue);
  return queue;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { data: { type: "string" }, output: { type: "string" }, limit: { type: "string" }, help: { type: "boolean" } } });
  if (values.help) console.log("使い方: node scripts/food-ai/review-queue.mjs --data DIR --output DIR [--limit 24]\n未確認画像を料理ごとに公平に選び、画像一覧とqueue.jsonを作ります。正解を自動確定する処理はありません。");
  else {
    const outputDir = values.output ?? path.join(root, "ml/artifacts/review-queue");
    const queue = await buildReviewQueue({ dataDir: values.data ?? path.join(root, "training-data/commons"), outputDir, limit: values.limit === undefined ? 24 : Number(values.limit) });
    console.log(`確認待ち ${queue.totalPending}件から${queue.items.length}件を選択。判定済み ${queue.skippedReviewedCount}件は省略。\n${path.resolve(outputDir, "queue.json")}`);
  }
}
