#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLock, inputFingerprint, readJson, writeJsonAtomic } from "./agent-utils.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");
const args = process.argv.slice(2);
const allowed = new Set(["--skip-collect", "--collect-only", "--force", "--help"]);
if (args.some((arg) => !allowed.has(arg))) throw new Error("未対応の引数です。--help を確認してください。");
if (args.includes("--help")) {
  console.log("food-ai:agent [--collect-only | --skip-collect] [--force]\n新規写真は最大300枚、ローカルデータ上限1GB、空き容量5GBを維持。Drive保管は別工程です。確認済みデータだけテスト環境へ反映します。公開・AWS操作は行いません。");
  process.exit(0);
}
if (args.includes("--collect-only") && args.includes("--skip-collect")) throw new Error("収集専用と収集省略は同時指定できません");
const dataDir = path.join(root, "training-data/commons");
const artifactRoot = path.join(root, "ml/artifacts");
const release = await acquireLock(path.join(artifactRoot, "agent.lock.json"));
if (!release) { console.log("別の学習サイクルが動作中です。今回はスキップします。"); process.exit(0); }
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
const runDir = path.join(artifactRoot, "runs", runId);
const stateFile = path.join(artifactRoot, "agent-state.json");
const latestFile = path.join(artifactRoot, "agent-latest.json");
let activeChild;
let aborted = false;
const abort = () => { aborted = true; activeChild?.kill("SIGTERM"); };
process.on("SIGTERM", abort);
process.on("SIGINT", abort);

async function step(script, parameters, timeoutMs = 20 * 60 * 1000) {
  if (aborted) throw new Error("学習サイクルを中断しました");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(scriptDir, script), ...parameters], { cwd: root, stdio: "inherit" });
    activeChild = child;
    let timedOut = false;
    let forceKill;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKill = setTimeout(() => child.kill("SIGKILL"), 5000);
    }, timeoutMs);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout); clearTimeout(forceKill); activeChild = null;
      if (code === 0 && !timedOut && !aborted) resolve();
      else reject(new Error(`${script}: ${timedOut ? "時間上限" : signal ?? `終了コード ${code}`}`));
    });
  });
}

const summary = { runId, startedAt: new Date().toISOString(), status: "running", dataDir, runDir };
try {
  await mkdir(dataDir, { recursive: true });
  await mkdir(runDir, { recursive: true });
  if (!args.includes("--skip-collect")) {
    try {
      await step("collect-commons.mjs", ["--output", dataDir, "--per-label", "10000", "--max-new", "300", "--max-bytes", "1000000000", "--min-free-bytes", "5000000000"]);
    } catch (error) {
      if (aborted) throw error;
      summary.collectionError = error.message;
      console.warn(`追加収集は未完了。既存データを確認します: ${error.message}`);
    }
    summary.collection = await readJson(path.join(dataDir, "collection-summary.json"), null);
  }
  await step("review-queue.mjs", ["--data", dataDir, "--output", path.join(artifactRoot, "review-queue"), "--limit", "72"]);
  summary.reviewQueue = path.join(artifactRoot, "review-queue/queue.json");
  if (args.includes("--collect-only")) {
    summary.status = "awaiting-visual-review";
  } else {
    const codeFiles = (await readdir(scriptDir)).filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs"));
    const deployment = path.join(root, "lib/food-ai/test-calibration.json");
    const fingerprintFiles = [...codeFiles.map((name) => path.join(scriptDir, name)), deployment,
      path.join(artifactRoot, "verified-splits.json"), path.join(artifactRoot, "research-splits.json"),
      path.join(artifactRoot, "verified-exclusions.json"),
      path.join(root, "lib/food-ai/photo-labels.json"), path.join(root, "lib/food-ai/test-photo-labels.json"),
      path.join(root, "lib/food-ai/food-calibration.mjs"), path.join(root, "package-lock.json")];
    const fingerprint = await inputFingerprint(dataDir, fingerprintFiles);
    const previous = await readJson(stateFile, {});
    if (previous.fingerprint === fingerprint && !args.includes("--force")) {
      summary.status = "unchanged";
      summary.previousRun = previous.runId;
      console.log("写真・確認結果・学習設定に変更がないため、再学習を省略します。");
    } else {
      const shared = ["--data", dataDir, "--cache", path.join(artifactRoot, "clip-score-cache.json"), "--deployment", deployment];
      const verifiedDir = path.join(runDir, "verified");
      await step("learn.mjs", [...shared, "--artifacts", verifiedDir, "--split-registry", path.join(artifactRoot, "verified-splits.json"), "--promote"]);
      summary.verified = await readJson(path.join(verifiedDir, "evaluation.json"), null);
      if (!summary.verified) throw new Error("確認済み学習の評価レポートがありません");
      if (summary.verified.status !== "trained") {
        const researchDir = path.join(runDir, "research");
        await step("learn.mjs", [...shared, "--artifacts", researchDir, "--split-registry", path.join(artifactRoot, "research-splits.json"), "--allow-unreviewed"]);
        summary.research = await readJson(path.join(researchDir, "evaluation.json"), null);
      }
      summary.status = summary.verified.promoted ? "test-model-updated" : "evaluated";
      summary.scope = "料理候補の順位補正。量・カロリー・PFCの推定精度ではありません。";
      await writeJsonAtomic(stateFile, { runId, fingerprint: await inputFingerprint(dataDir, fingerprintFiles), completedAt: new Date().toISOString() });
    }
  }
} catch (error) {
  summary.status = "failed";
  summary.error = error.message;
  process.exitCode = 1;
} finally {
  summary.completedAt = new Date().toISOString();
  await writeJsonAtomic(path.join(runDir, "summary.json"), summary);
  await writeJsonAtomic(latestFile, summary);
  await release();
  process.removeListener("SIGTERM", abort);
  process.removeListener("SIGINT", abort);
}
console.log(`学習サイクル: ${summary.status}\n結果: ${latestFile}`);
if (summary.error) console.error(summary.error);
