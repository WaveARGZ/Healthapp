import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CODE_FILES, createLearningSnapshot } from "./snapshot-learning.mjs";

const RUN = "2026-10-09T01-02-03-004Z-123";
const PREVIOUS = "2026-10-08T01-02-03-004Z-456";
async function fixture(context) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "bodymake-snapshot-test-")));
  context.after(() => rm(root, { recursive: true, force: true }));
  const put = async (relative, value) => { const file = path.join(root, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, typeof value === "string" ? value : JSON.stringify(value)); };
  for (const relative of [...CODE_FILES, "package.json", "package-lock.json", "lib/food-ai/photo-labels.json", "lib/food-ai/test-photo-labels.json", "lib/food-ai/food-calibration.mjs", "lib/food-ai/test-calibration.json"]) await put(relative, relative.endsWith(".json") ? {} : "// fixture source");
  const summary = { runId: RUN, dataDir: path.join(root, "training-data/commons"), runDir: path.join(root, "ml/artifacts/runs", RUN), status: "evaluated", completedAt: new Date().toISOString() };
  await put("ml/artifacts/agent-latest.json", summary);
  await put(`ml/artifacts/runs/${RUN}/summary.json`, summary);
  await put(`ml/artifacts/runs/${RUN}/verified/evaluation.json`, { paths: { data: summary.dataDir }, status: "trained" });
  await put(`ml/artifacts/runs/${RUN}/verified/review.csv`, "ファイルID,理由\ncommons-1,uncertain\n");
  await put("ml/artifacts/verified-exclusions.json", { schemaVersion: 1, exclusions: [] });
  return { root, put, summary, options: { root, diskCheck: async () => ({ sufficient: true }) } };
}

test("固定対象とfixture・評価CSVを保存し、env/認証JSON/写真を収集しない", async (context) => {
  const { put, options } = await fixture(context);
  for (const file of [".env.local", "scripts/food-ai/credentials.json", `ml/artifacts/runs/${RUN}/credentials.json`, `ml/artifacts/runs/${RUN}/user-photo.jpg`]) await put(file, "DO-NOT-COPY-PRIVATE");
  const result = await createLearningSnapshot(options);
  const manifest = JSON.parse(await readFile(path.join(result.output, "archive-source.json"), "utf8"));
  assert.ok(manifest.files.includes("scripts/food-ai/fixtures/commons-fetch.mjs"));
  assert.ok(manifest.files.includes("lib/food-ai/photo-labels.json"));
  assert.ok(manifest.files.includes("lib/food-ai/test-photo-labels.json"));
  assert.ok(manifest.files.includes("ml/artifacts/verified-exclusions.json"));
  assert.ok(manifest.files.includes(`ml/artifacts/runs/${RUN}/verified/review.csv`));
  assert.equal(manifest.snapshot.includesImages, false);
  for (const file of manifest.files) assert.equal((await readFile(path.join(result.output, file), "utf8")).includes("DO-NOT-COPY-PRIVATE"), false);
});

test("変更なしサイクルでも前回の実学習候補を保存する", async (context) => {
  const { put, summary, options } = await fixture(context);
  const previous = { ...summary, runId: PREVIOUS, runDir: path.join(options.root, "ml/artifacts/runs", PREVIOUS) };
  await put(`ml/artifacts/runs/${PREVIOUS}/summary.json`, previous);
  await put(`ml/artifacts/runs/${PREVIOUS}/verified/candidate-calibration.json`, { status: "trained" });
  const latest = { ...summary, status: "unchanged", previousRun: PREVIOUS };
  await put("ml/artifacts/agent-latest.json", latest);
  await put(`ml/artifacts/runs/${RUN}/summary.json`, latest);
  const result = await createLearningSnapshot(options);
  assert.deepEqual(result.runIds, [RUN, PREVIOUS]);
  assert.equal(JSON.parse(await readFile(path.join(result.output, `ml/artifacts/runs/${PREVIOUS}/verified/candidate-calibration.json`))).status, "trained");
});

test("非公開履歴・認証情報・リンクを拒否する", async (context) => {
  const { root, put, summary, options } = await fixture(context);
  await put("ml/artifacts/agent-latest.json", { ...summary, dataDir: path.join(root, "private-meals") });
  await assert.rejects(createLearningSnapshot(options), /公開Commons/);
  await put("ml/artifacts/agent-latest.json", summary);
  await put(`ml/artifacts/runs/${RUN}/verified/evaluation.json`, { paths: { data: summary.dataDir }, access_token: "never-copy" });
  await assert.rejects(createLearningSnapshot(options), /認証情報/);
  await put(`ml/artifacts/runs/${RUN}/verified/evaluation.json`, { paths: { data: summary.dataDir } });
  const target = path.join(root, "scripts/food-ai/fixtures/commons-fetch.mjs");
  await rm(target);
  await symlink(path.join(root, "package.json"), target);
  await assert.rejects(createLearningSnapshot(options), /通常ファイル/);
});

test("空き容量不足と準備中の変更で完成アーカイブを公開しない", async (context) => {
  const { put, options } = await fixture(context);
  await assert.rejects(createLearningSnapshot({ ...options, diskCheck: async () => ({ sufficient: false }) }), /空き容量5GB/);
  await assert.rejects(createLearningSnapshot({ ...options, diskCheck: async () => { await put("package.json", { changed: true }); return { sufficient: true }; } }), /準備中に変更/);
});
