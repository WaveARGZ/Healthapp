#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(scriptDir, "../../training-data/commons");
async function step(script, args) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(scriptDir, script), ...args], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  if (result !== 0) process.exit(result);
}

console.log("公開画像の収集 → 品質検査 → 仮ラベルによる学習実験を開始します。公開モデルは自動更新しません。");
await step("collect-commons.mjs", ["--per-label", "30"]);
await step("learn.mjs", ["--data", dataDir, "--prepare-only", "--allow-unreviewed"]);
await step("learn.mjs", ["--data", dataDir, "--allow-unreviewed"]);
console.log("実験完了。ml/artifacts/evaluation.json と review.csv を確認し、仮ラベルを検証してください。");
