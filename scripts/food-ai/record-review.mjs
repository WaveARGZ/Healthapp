#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { fileHash, readJson, writeJsonAtomic } from "./agent-utils.mjs";
import { completedReview, loadReviewRecords, reviewLabels, validId } from "./review-queue.mjs";

export async function recordReviews({ dataDir, decisions, reviewer }) {
  if (typeof reviewer !== "string" || !reviewer.trim()) throw new Error("--reviewer に確認者を指定してください");
  const list = Array.isArray(decisions) ? decisions : decisions?.decisions;
  if (!Array.isArray(list) || !list.length) throw new Error("判定は配列、またはdecisions配列を持つJSONで指定してください");
  const labels = await reviewLabels();
  const { records } = await loadReviewRecords(dataDir);
  const byId = new Map(records.map((item) => [item.id, item]));
  const seen = new Set(), updates = [], unchanged = [];
  const reviewedAt = new Date().toISOString();
  // Validate the entire batch first, so a later invalid decision cannot silently
  // leave earlier items applied. Each metadata replacement is also atomic.
  for (const decision of list) {
    if (!decision || !validId(decision.id)) throw new Error("不正な画像IDです");
    if (seen.has(decision.id)) throw new Error(`同じIDの判定が重複しています: ${decision.id}`);
    seen.add(decision.id);
    if (!/^[a-f0-9]{64}$/.test(decision.imageSha256 ?? "")) throw new Error(`SHA-256が不正です: ${decision.id}`);
    if (decision.foodId !== null && !labels.has(decision.foodId)) throw new Error(`対応していない料理IDです: ${decision.id}`);
    if (typeof decision.notes !== "string" || !decision.notes.trim()) throw new Error(`目視で確認した根拠をnotesに記録してください: ${decision.id}`);
    const item = byId.get(decision.id);
    if (!item) throw new Error(`画像とメタデータを安全に特定できません: ${decision.id}`);
    if (decision.imageSha256 !== item.imageSha256) throw new Error(`目視確認後に画像が変更されています: ${decision.id}`);
    const accepted = decision.foodId !== null;
    const state = accepted ? "accepted" : "rejected";
    const prior = completedReview(item.metadata, item.imageSha256);
    if (prior) {
      if (prior !== state || (accepted && item.metadata.confirmedFoodId !== decision.foodId)) throw new Error(`既存の確認済み判定と矛盾しています: ${decision.id}`);
      unchanged.push(decision.id);
      continue;
    }
    const metadata = { ...item.metadata, labelVerified: accepted,
      ...(accepted ? { confirmedFoodId: decision.foodId, confirmedFoodName: labels.get(decision.foodId) } : {}),
      review: { method: "visual-agent", reviewer: reviewer.trim(), reviewedAt,
        imageSha256: item.imageSha256, decision: state, foodId: decision.foodId, notes: decision.notes.trim() } };
    updates.push({ item, metadata });
  }
  for (const { item } of updates) {
    if (await fileHash(item.imagePath) !== item.imageSha256 ||
      JSON.stringify(await readJson(item.metadataPath)) !== JSON.stringify(item.metadata)) {
      throw new Error(`判定の保存前にデータが変更されました: ${item.id}`);
    }
  }
  for (const { item, metadata } of updates) await writeJsonAtomic(item.metadataPath, metadata);
  return { reviewedAt, recorded: updates.map(({ item }) => item.id), unchanged,
    accepted: updates.filter(({ metadata }) => metadata.labelVerified).length,
    rejected: updates.filter(({ metadata }) => !metadata.labelVerified).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { data: { type: "string" }, decisions: { type: "string" }, reviewer: { type: "string" }, help: { type: "boolean" } } });
  if (values.help) console.log('使い方: node scripts/food-ai/record-review.mjs --data DIR --decisions FILE --reviewer NAME\n判定JSON: [{"id":"commons-123","imageSha256":"画像のSHA-256","foodId":"ramen または除外時null","notes":"実際に見た根拠"}]\n画像を目視確認してから実行してください。既存の異なる確定判定は上書きしません。');
  else {
    if (!values.data || !values.decisions) throw new Error("--data と --decisions が必要です");
    const result = await recordReviews({ dataDir: values.data, decisions: await readJson(path.resolve(values.decisions)), reviewer: values.reviewer });
    console.log(`保存 ${result.recorded.length}件（採用 ${result.accepted}、除外 ${result.rejected}）、同一判定 ${result.unchanged.length}件。`);
  }
}
