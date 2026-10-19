#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline, RawImage } from "@huggingface/transformers";
import { assessPromotion, evaluate, trainCalibration } from "./calibration-training.mjs";
import { digest, hasIndependentReview, planDatasetSplits, validateSplitRegistry } from "./dataset-splits.mjs";
import { FOOD_BASE_MODEL, FOOD_BASE_REVISION, isFoodCalibrationModel } from "../../lib/food-ai/food-calibration.mjs";
import { acquireLock } from "./agent-utils.mjs";
import { matchLearningExclusion, validateLearningExclusions } from "./learning-exclusions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const valuedFlags = new Set(["--data", "--artifacts", "--cache", "--split-registry", "--deployment", "--exclusions"]);
const switches = new Set(["--help", "--prepare-only", "--promote", "--allow-unreviewed"]);
const options = new Map();
for (let index = 0; index < args.length; index += 1) {
  const flag = args[index];
  if (valuedFlags.has(flag)) {
    if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${flag} の値がありません`);
    options.set(flag, args[++index]);
  } else if (switches.has(flag)) options.set(flag, true);
  else throw new Error(`不明なオプション: ${flag}`);
}
if (options.has("--help") || !options.has("--data")) {
  console.log("使い方: npm run food-ai:learn -- --data DIR [--artifacts DIR] [--cache FILE] [--split-registry FILE] [--deployment FILE] [--exclusions FILE] [--prepare-only] [--allow-unreviewed] [--promote]");
  console.log("既定のラベルと反映先はテスト用です。本番用の反映先を明示した場合だけ本番ラベルを使います。");
  console.log("独立した画像確認には labelVerified:true と review:{method:'human'|'visual-agent',reviewer,reviewedAt,imageSha256} が必要です。");
  console.log("データ不足は evaluation.json に記録して正常終了します。--allow-unreviewed は仮ラベルの実験専用で反映できません。");
  process.exit(options.has("--help") ? 0 : 1);
}
const dataDir = path.resolve(options.get("--data"));
const artifactDir = path.resolve(options.get("--artifacts") ?? path.join(root, "ml/artifacts"));
const cacheFile = path.resolve(options.get("--cache") ?? path.join(root, "ml/artifacts/clip-score-cache.json"));
const registryFile = path.resolve(options.get("--split-registry") ?? path.join(dataDir, "split-registry.json"));
const exclusionsFile = path.resolve(options.get("--exclusions") ?? path.join(root, "ml/artifacts/verified-exclusions.json"));
const productionDeploymentFile = path.join(root, "lib/food-ai/deployed-calibration.json");
const deploymentFile = path.resolve(options.get("--deployment") ?? path.join(root, "lib/food-ai/test-calibration.json"));
const allowUnreviewed = options.has("--allow-unreviewed");
const promote = options.has("--promote");
if (dataDir === root) throw new Error("プロジェクト直下をデータフォルダにしないでください");
if (allowUnreviewed && promote) throw new Error("仮ラベルの実験はモデルに反映できません");
if (!(await stat(dataDir)).isDirectory()) throw new Error("学習データのディレクトリが必要です");
const labelsFile = path.join(root, "lib/food-ai", deploymentFile === productionDeploymentFile ? "photo-labels.json" : "test-photo-labels.json");
const labels = JSON.parse(await readFile(labelsFile, "utf8"));
const labelIds = labels.map(([id]) => id);
const transformersPackage = JSON.parse(await readFile(path.join(root, "node_modules/@huggingface/transformers/package.json"), "utf8"));
const inference = {
  task: "zero-shot-image-classification", baseModel: FOOD_BASE_MODEL, baseRevision: FOOD_BASE_REVISION,
  dtype: "q4", transformersVersion: transformersPackage.version,
  nodeVersion: process.versions.node, platform: process.platform, arch: process.arch,
};

async function readOptionalJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}
function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
async function differenceHash(image) {
  const small = await image.resize(9, 8);
  let bits = 0n;
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
    const offset = (y * 9 + x) * small.channels;
    const gray = (at) => 0.299 * small.data[at] + 0.587 * small.data[at + 1] + 0.114 * small.data[at + 2];
    bits = (bits << 1n) | BigInt(gray(offset) > gray(offset + small.channels));
  }
  return bits.toString(16).padStart(16, "0");
}
const mimeFor = (name) => name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

async function run() {
  const exclusions = validateLearningExclusions(options.has("--exclusions")
    ? JSON.parse(await readFile(exclusionsFile, "utf8"))
    : await readOptionalJson(exclusionsFile, { schemaVersion: 1, exclusions: [] }));
  const exclusionsFingerprint = digest(JSON.stringify(exclusions));
  await mkdir(artifactDir, { recursive: true });
  const entries = await readdir(dataDir, { withFileTypes: true });
  const images = new Map(entries.filter((entry) => entry.isFile() && /\.(jpe?g|png)$/i.test(entry.name)).map((entry) => [path.parse(entry.name).name, entry.name]));
  const review = [];
  const appliedExclusions = [];
  // Verify exclusion hashes before any registry writes. A changed file must not
  // be admitted by the recoverable per-record error handler below.
  for (const exclusion of exclusions.exclusions) {
    const matches = entries.filter((entry) => entry.isFile() && /\.(jpe?g|png)$/i.test(entry.name) && path.parse(entry.name).name === exclusion.id);
    if (matches.length > 1) throw new Error(`除外対象に複数の画像があります: ${exclusion.id}`);
    if (!matches.length) continue;
    const hash = digest(await readFile(path.join(dataDir, matches[0].name)));
    const matched = matchLearningExclusion(exclusions, exclusion.id, hash);
    appliedExclusions.push({ ...matched, imageName: matches[0].name });
    review.push({ id: exclusion.id, reason: `学習と評価から除外: ${matched.reason}`, label: "" });
    images.delete(exclusion.id);
  }
  const excludedIds = new Set(appliedExclusions.map((item) => item.id));
  const valid = [];
  let inspectedRecords = 0;
  const metadataNames = new Set(["sources.json", "collection-summary.json", "collect-state.json", "split-registry.json"]);
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json") && !metadataNames.has(item.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    const id = entry.name.slice(0, -5);
    if (excludedIds.has(id)) { inspectedRecords += 1; continue; }
    const imageName = images.get(id);
    try {
      const record = JSON.parse(await readFile(path.join(dataDir, entry.name), "utf8"));
      if (!imageName && !(record.schemaVersion === 1 && record.id === id)) continue;
      inspectedRecords += 1;
      if (!imageName) { review.push({ id, reason: "写真がない", label: record.confirmedFoodId }); continue; }
      images.delete(id);
      if (record.schemaVersion !== 1 || record.id !== id || typeof record.confirmedFoodName !== "string" || !record.confirmedFoodName.trim()) throw new Error("正解データの形式が不正");
      if (record.review?.decision === "rejected") { review.push({ id, reason: `画像確認で除外: ${record.review.notes ?? "料理ラベル不適合"}`, label: record.confirmedFoodId }); continue; }
      if (!labelIds.includes(record.confirmedFoodId)) { review.push({ id, reason: "対応外の料理。ラベル設計が必要", label: record.confirmedFoodId }); continue; }
      const bytes = await readFile(path.join(dataDir, imageName));
      const image = await RawImage.read(new Blob([bytes], { type: mimeFor(imageName) }));
      if (image.width < 32 || image.height < 32 || image.channels < 3) throw new Error("写真が小さすぎるか読み込めない");
      const hash = digest(bytes);
      valid.push({ id, imageName, label: record.confirmedFoodId, hash, dhash: await differenceHash(image),
        verified: Boolean(hasIndependentReview(record, hash)), review: record.review ?? null });
    } catch (error) {
      if (imageName) { images.delete(id); review.push({ id, reason: `破損または不正: ${error.message}`, label: "" }); }
    }
  }
  for (const imageName of images.values()) review.push({ id: imageName, reason: "正解JSONがない", label: "" });

  const originalRegistry = await readOptionalJson(registryFile, { schemaVersion: 1, id: randomUUID(), assignments: {} });
  validateSplitRegistry(originalRegistry);
  const prepared = planDatasetSplits(valid, originalRegistry, { allowUnreviewed });
  review.push(...prepared.review);
  await writeJson(registryFile, prepared.registry);
  const { splits, datasetFingerprint } = prepared;
  const rows = Object.values(splits).flat();
  const verifiedRecords = valid.filter((item) => item.verified);
  const counts = Object.fromEntries(labelIds.map((id) => [id, rows.filter((row) => row.label === id).length]));
  const splitCounts = Object.fromEntries(Object.entries(splits).map(([name, items]) => [name, {
    total: items.length, verified: items.filter((item) => item.verified).length,
    perClass: Object.fromEntries(labelIds.map((id) => [id, items.filter((row) => row.label === id).length])),
  }]));
  const report = {
    schemaVersion: 2, createdAt: new Date().toISOString(), status: "prepared", baseModel: FOOD_BASE_MODEL,
    baseRevision: FOOD_BASE_REVISION, inference,
    evaluationKind: allowUnreviewed ? "weak-label-research" : "independently-reviewed-holdout",
    scope: `${labelIds.length}種類の候補順位を補正する学習。量・カロリー・PFCの学習ではありません。`,
    inspectedRecords, validImages: valid.length, independentlyReviewedImages: verifiedRecords.length,
    excludedImages: appliedExclusions.length, exclusions: appliedExclusions, exclusionsFingerprint,
    independentImages: prepared.independentImages, reviewCount: review.length,
    reviewSources: Object.fromEntries([...new Set(verifiedRecords.map((item) => `${item.review.method}:${item.review.reviewer}`))].map((source) => [source, verifiedRecords.filter((item) => `${item.review.method}:${item.review.reviewer}` === source).length])),
    datasetFingerprint, splitRegistryId: prepared.registry.id,
    paths: { data: dataDir, artifacts: artifactDir, cache: cacheFile, splitRegistry: registryFile, deployment: deploymentFile, labels: labelsFile, exclusions: exclusionsFile },
    splits: splitCounts, classCounts: counts, promotionPassed: false, promoted: false,
    limitations: ["同じ保留データの反復評価は独立した新規検証ではありません。p値は参考値です。", ...(allowUnreviewed ? ["仮ラベルの一致率は実際の認識精度を示しません。モデル反映は禁止です。"] : [])],
  };
  const reportFile = path.join(artifactDir, "evaluation.json");
  await writeFile(path.join(artifactDir, "review.csv"), [["ファイルID", "要確認の理由", "料理ID"], ...review.map((item) => [item.id, item.reason, item.label])].map((row) => row.map(csvCell).join(",")).join("\n") + "\n");
  const insufficient = [];
  if (rows.length < 100) insufficient.push(`学習対象が100枚未満（${rows.length}枚）`);
  if (new Set(rows.map((item) => item.label)).size < 5) insufficient.push("料理が5種類未満");
  if (splits.validation.length < 15 || splits.test.length < 15) insufficient.push("検証用・テスト用が各15枚未満");
  report.insufficientReasons = insufficient;
  if (insufficient.length) report.status = "insufficient-data";
  await writeJson(reportFile, report);
  console.log(`検査: ${inspectedRecords}件、独立確認済み ${verifiedRecords.length}枚、学習対象 ${rows.length}枚、除外 ${appliedExclusions.length}枚、要確認 ${review.length}件`);
  console.log(`評価レポート: ${reportFile}`);
  if (options.has("--prepare-only") || insufficient.length) {
    if (insufficient.length) console.log(`今回は学習を見送り: ${insufficient.join("、")}`);
    return;
  }

  const baselineModel = { schemaVersion: 1, status: "baseline", baseModel: FOOD_BASE_MODEL, baseRevision: FOOD_BASE_REVISION };
  const incumbent = await readOptionalJson(deploymentFile, baselineModel);
  const isBaseline = incumbent?.schemaVersion === 1 && incumbent.status === "baseline" && incumbent.baseModel === FOOD_BASE_MODEL;
  if (!isBaseline && !isFoodCalibrationModel(incumbent, labelIds)) throw new Error("現行モデルの形式が不正です。上書きせず調査してください。");
  const incumbentFingerprint = digest(JSON.stringify(incumbent));
  let cache = await readOptionalJson(cacheFile, {});
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) throw new Error("スコアキャッシュの形式が不正です");
  const cacheVersion = digest(JSON.stringify({ inference, labels }));
  let classifier;
  let newlyScored = 0;
  const scored = {};
  for (const [splitName, items] of Object.entries(splits)) {
    scored[splitName] = [];
    for (const item of items) {
      const key = `${cacheVersion}:${item.hash}`;
      let scores = cache[key];
      if (!Array.isArray(scores) || scores.length !== labels.length || scores.some((score) => !Number.isFinite(score) || score < 0) || scores.reduce((a, b) => a + b, 0) <= 0) {
        if (!classifier) { console.log("CLIPモデルを読み込みます。"); classifier = await pipeline("zero-shot-image-classification", FOOD_BASE_MODEL, { dtype: "q4", revision: FOOD_BASE_REVISION }); }
        const bytes = await readFile(path.join(dataDir, item.imageName));
        const outputs = await classifier(new Blob([bytes], { type: mimeFor(item.imageName) }), labels.map(([, prompt]) => prompt));
        const lookup = new Map(outputs.map((result) => [result.label, result.score]));
        scores = labels.map(([, prompt]) => lookup.get(prompt) ?? 0);
        cache[key] = scores;
        newlyScored += 1;
        if (newlyScored % 10 === 0) await writeJson(cacheFile, cache);
      }
      const total = scores.reduce((a, b) => a + b, 0);
      scored[splitName].push({ id: item.hash, label: item.label, scores: scores.map((score) => score / total) });
    }
    console.log(`${splitName}: ${items.length}枚のスコアを取得`);
  }
  if (newlyScored) await writeJson(cacheFile, cache);
  cache = null;

  const validationBaseline = evaluate(scored.validation, labelIds);
  const validationIncumbent = evaluate(scored.validation, labelIds, incumbent);
  const candidates = [0.01, 0.03, 0.1, 0.3].map((regularization) => {
    const model = trainCalibration(scored.train, labelIds, regularization);
    return { regularization, model, validation: evaluate(scored.validation, labelIds, model) };
  });
  candidates.sort((a, b) => b.validation.macroTop1Rate - a.validation.macroTop1Rate || b.validation.top1 - a.validation.top1 || b.validation.top5 - a.validation.top5);
  const best = candidates[0];
  const testBaseline = evaluate(scored.test, labelIds);
  const testIncumbent = evaluate(scored.test, labelIds, incumbent);
  const testTrained = evaluate(scored.test, labelIds, best.model);
  const baselineComparison = assessPromotion(testBaseline, testTrained);
  const incumbentComparison = assessPromotion(testIncumbent, testTrained);
  const validationPassed = [validationBaseline, validationIncumbent].every((reference) =>
    best.validation.top1 > reference.top1 && best.validation.top5 >= reference.top5 &&
    best.validation.macroTop1Rate >= reference.macroTop1Rate && best.validation.macroTop5Rate >= reference.macroTop5Rate);
  const coveragePassed = labelIds.every((id) => counts[id] >= 10 && splitCounts.train.perClass[id] >= 5 && splitCounts.validation.perClass[id] >= 2 && splitCounts.test.perClass[id] >= 2);
  const incumbentProvenancePassed = incumbent.status === "baseline" || incumbent.trainingMetadata?.splitRegistryId === prepared.registry.id;
  const promotionReasons = [
    ...(allowUnreviewed ? ["仮ラベルの実験は反映対象外"] : []),
    ...(!coveragePassed ? [`全${labelIds.length}料理に独立画像10枚以上、学習5枚・検証2枚・テスト2枚以上が必要`] : []),
    ...(!validationPassed ? ["検証データでベースモデルと現行モデルの両方を改善していない"] : []),
    ...(!incumbentProvenancePassed ? ["現行モデルと分割台帳の出自が一致せず、学習混入を否定できない"] : []),
    ...baselineComparison.reasons.map((reason) => `ベースモデル比較: ${reason}`),
    ...incumbentComparison.reasons.map((reason) => `現行モデル比較: ${reason}`),
  ];
  best.model.trainingMetadata = {
    datasetFingerprint, splitRegistryId: prepared.registry.id, createdAt: report.createdAt,
    evaluationKind: report.evaluationKind, independentlyReviewed: !allowUnreviewed,
    scoreCacheVersion: cacheVersion, baseRevision: FOOD_BASE_REVISION, inference, exclusionsFingerprint,
  };
  Object.assign(report, {
    status: "trained", incumbentFingerprint, candidateFingerprint: digest(JSON.stringify(best.model)),
    chosenRegularization: best.regularization, newlyScored,
    validation: { baseline: validationBaseline, incumbent: validationIncumbent, trained: best.validation },
    test: { baseline: testBaseline, incumbent: testIncumbent, trained: testTrained },
    comparisons: { baseline: baselineComparison, incumbent: incumbentComparison },
    validationPassed, coveragePassed, incumbentProvenancePassed,
    promotionPassed: promotionReasons.length === 0, promotionReasons,
  });
  await writeJson(path.join(artifactDir, "candidate-calibration.json"), best.model);
  if (promote && report.promotionPassed) {
    const latest = await readOptionalJson(deploymentFile, baselineModel);
    if (digest(JSON.stringify(latest)) !== incumbentFingerprint) throw new Error("評価中に現行モデルが変更されました。反映を中止します。");
    await writeJson(path.join(artifactDir, "previous-calibration.json"), incumbent);
    await writeJson(deploymentFile, best.model);
    report.promoted = true;
  }
  await writeJson(reportFile, report);
  console.log(`${allowUnreviewed ? "仮ラベル一致" : "保留データ正解"}: ベース ${testBaseline.top1}/${testBaseline.total}、現行 ${testIncumbent.top1}/${testIncumbent.total}、候補 ${testTrained.top1}/${testTrained.total}`);
  console.log(`反映条件: ${report.promotionPassed ? "合格" : "未達"}、反映: ${report.promoted ? deploymentFile : "なし"}`);
}

const lockFile = `${registryFile}.lock`;
const release = await acquireLock(lockFile);
if (!release) throw new Error(`別の学習処理が分割台帳を使用中です: ${lockFile}`);
try { await run(); } finally { await release(); }
