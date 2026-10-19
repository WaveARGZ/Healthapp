#!/usr/bin/env node
// Explicit allowlist: never back up .env, credentials, app user data or tokens.
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLock, writeJsonAtomic } from "./agent-utils.mjs";
import { inspectDiskBudget } from "./commons-collection.mjs";

export const CODE_FILES = Object.freeze([
  "agent.mjs", "agent-utils.mjs", "agent-utils.test.mjs", "calibration-training.mjs", "calibration-training.test.mjs",
  "collect-commons.mjs", "commons-collection.mjs", "commons-collection.test.mjs", "commons-sources.mjs",
  "collect-nutrition5k.mjs", "nutrition5k.test.mjs", "nutrition5k-cache.mjs", "nutrition5k-cache.test.mjs", "nutrition5k-cache.md",
  "dataset-sources.json", "dataset-splits.mjs", "dataset-splits.test.mjs", "learn.mjs", "learning-cli.test.mjs", "learning-exclusions.mjs", "learning-exclusions.test.mjs",
  "record-review.mjs", "review-queue.mjs", "review-queue.test.mjs", "drive-archive.mjs", "drive-archive.test.mjs",
  "snapshot-learning.mjs", "snapshot-learning.test.mjs", "photo-labels.test.mjs", "fixtures/commons-fetch.mjs", "README.md", "DRIVE-ARCHIVE.md",
].map((name) => `scripts/food-ai/${name}`));
const runPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\d+$/;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function rejectCredentialFields(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:password|passwd|client[_-]?secret|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|secret[_-]?access[_-]?key|aws[_-]?secret[_-]?access[_-]?key|private[_-]?key|authorization)$/i.test(key)) throw new Error(`認証情報のキーを含むJSONは保存できません: ${key}`);
    rejectCredentialFields(child);
  }
}

export async function createLearningSnapshot({ root = defaultRoot, diskCheck = inspectDiskBudget } = {}) {
  root = path.resolve(root);
  const artifacts = path.join(root, "ml/artifacts");
  if (await realpath(root) !== root || await realpath(artifacts) !== artifacts) throw new Error("実パスの保存先を指定してください");
  const release = await acquireLock(path.join(artifacts, "agent.lock.json"));
  if (!release) throw new Error("学習サイクルの完了後にバックアップしてください");
  try {
    const files = new Map();
    let totalBytes = 0;
    async function include(relative, optional = false) {
      if (files.has(relative)) return files.get(relative).bytes;
      const source = path.join(root, relative);
      try {
        if (await realpath(source) !== source || !(await lstat(source)).isFile()) throw new Error(`通常ファイルではありません: ${relative}`);
        const size = (await lstat(source)).size;
        if (size > 100_000_000 || totalBytes + size > 250_000_000) throw new Error("学習バックアップの安全サイズ上限を超えています");
        const bytes = await readFile(source);
        if (bytes.length !== size || await realpath(source) !== source) throw new Error(`読み込み中に変更されました: ${relative}`);
        if (relative.endsWith(".json")) rejectCredentialFields(JSON.parse(bytes.toString("utf8")));
        totalBytes += bytes.length;
        files.set(relative, { bytes, source, sha256: digest(bytes) });
        return bytes;
      } catch (error) { if (!(optional && error.code === "ENOENT")) throw error; return null; }
    }
    const json = async (relative) => JSON.parse((await include(relative)).toString("utf8"));
    const latest = await json("ml/artifacts/agent-latest.json");
    const dataDir = path.join(root, "training-data/commons");
    const runIds = [];
    let summary = latest;
    while (summary) {
      if (!runPattern.test(summary.runId ?? "") || summary.dataDir !== dataDir || summary.runDir !== path.join(artifacts, "runs", summary.runId) || summary.status === "running" || !Number.isFinite(Date.parse(summary.completedAt))) throw new Error("公開Commons専用の完了済み学習履歴だけ保存できます");
      if (runIds.includes(summary.runId) || runIds.length >= 20) throw new Error("前回学習の参照が循環または長すぎます");
      runIds.push(summary.runId);
      const prefix = `ml/artifacts/runs/${summary.runId}`;
      if (JSON.stringify(await json(`${prefix}/summary.json`)) !== JSON.stringify(summary)) throw new Error("最新状態と実行履歴が一致しません");
      for (const mode of ["verified", "research"]) {
        for (const filename of ["evaluation.json", "candidate-calibration.json", "previous-calibration.json", "review.csv"]) {
          const bytes = await include(`${prefix}/${mode}/${filename}`, true);
          if (bytes && filename === "evaluation.json" && JSON.parse(bytes.toString("utf8")).paths?.data !== dataDir) throw new Error("非公開データ由来の評価レポートは保存できません");
        }
      }
      if (!summary.previousRun) break;
      if (!runPattern.test(summary.previousRun)) throw new Error("前回学習IDが不正です");
      summary = await json(`ml/artifacts/runs/${summary.previousRun}/summary.json`);
    }
    for (const relative of [...CODE_FILES, "package.json", "package-lock.json", "lib/food-ai/photo-labels.json", "lib/food-ai/test-photo-labels.json", "lib/food-ai/food-calibration.mjs", "lib/food-ai/test-calibration.json"]) await include(relative);
    for (const relative of ["ml/artifacts/agent-state.json", "ml/artifacts/verified-splits.json", "ml/artifacts/research-splits.json", "ml/artifacts/verified-exclusions.json", "ml/artifacts/clip-score-cache.json", "ml/artifacts/drive-archive/state.json", "ml/artifacts/commons-attribution-refresh-20261009.json", "training-data/nutrition5k/archive-cache-index.json"]) await include(relative, true);
    if (!(await diskCheck(artifacts, { requiredBytes: totalBytes + 1_000_000 })).sufficient) throw new Error("PCの空き容量5GBを維持できないため保存を停止しました");
    const base = path.join(artifacts, "learning-snapshots");
    await mkdir(base, { recursive: true });
    if (await realpath(base) !== base) throw new Error("バックアップ保存先のリンクは使えません");
    const output = await mkdtemp(path.join(base, `${new Date().toISOString().replace(/[:.]/g, "-")}-`));
    for (const [relative, file] of files) {
      const destination = path.join(output, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.bytes, { flag: "wx" });
    }
    for (const [relative, file] of files) {
      if (await realpath(file.source) !== file.source || digest(await readFile(file.source)) !== file.sha256) throw new Error(`準備中に変更されました。未完成の保存先は転送しないでください: ${relative}`);
    }
    await writeJsonAtomic(path.join(output, "archive-source.json"), {
      schemaVersion: 1, dataset: "learning-runs", publicSource: {
        url: "https://github.com/WaveARGZ/Healthapp",
        license: "User-owned BodyMake training artifacts. Input images retain their per-source licenses; see scripts/food-ai/dataset-sources.json. This is private backup, not a public license grant.",
        licenseUrl: "https://github.com/WaveARGZ/Healthapp",
      }, files: [...files.keys()].sort(),
      snapshot: { createdAt: new Date().toISOString(), runIds, totalBytes, includesImages: false, scope: "Public-source Commons training code, splits, calibration and evaluation. Nutrition5k cache index only; nutrition training is separate." },
    });
    return { output, files: files.size, totalBytes, evaluationRun: latest.runDir, runIds };
  } finally { await release(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw new Error("引数は不要です。対象は固定allowlistです");
  console.log(JSON.stringify(await createLearningSnapshot(), null, 2));
}
