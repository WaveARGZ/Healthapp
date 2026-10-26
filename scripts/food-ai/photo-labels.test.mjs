import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { reviewLabels } from "./review-queue.mjs";

const root = new URL("../../", import.meta.url);
const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, root), "utf8"));
const [productionLabels, testLabels, library] = await Promise.all([
  readJson("lib/food-ai/photo-labels.json"), readJson("lib/food-ai/test-photo-labels.json"),
  readJson("lib/data/food-library.json"),
]);

test("test recognition adds edamame without changing the 27 production labels or prompts", () => {
  assert.equal(productionLabels.length, 27);
  assert.equal(testLabels.length, 28);
  assert.deepEqual(testLabels.slice(0, productionLabels.length), productionLabels);
  assert.deepEqual(testLabels.at(-1), ["edamame", "a bowl of edamame green soybeans in pods or shelled"]);
  assert.equal(new Set(testLabels.map(([id]) => id)).size, testLabels.length);
  assert.equal(new Set(testLabels.map(([, prompt]) => prompt)).size, testLabels.length);
  assert.ok(library.foods.some((food) => food.id === "edamame" && food.name === "枝豆（調理済み）"));
});

test("the browser catalog selects test labels only for the isolated test environment", async () => {
  const source = await readFile(new URL("lib/food-ai/food-catalog.ts", root), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  for (const isTestEnvironment of [false, true]) {
    const exports = {};
    const dependencies = {
      "@/lib/data/food-library.json": library,
      "@/lib/food-ai/photo-labels.json": productionLabels,
      "@/lib/food-ai/test-photo-labels.json": testLabels,
      "@/lib/cloud/config": { useTestFoodModel: isTestEnvironment },
      "@/types/food-database": { foodToMealItem: (food) => ({ name: food.name }) },
    };
    runInNewContext(outputText, { exports, require: (id) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency: ${id}`);
      return dependencies[id];
    } });
    const selected = Array.from(exports.foodCatalog, ({ id, clipLabel }) => [id, clipLabel]);
    assert.deepEqual(selected, isTestEnvironment ? testLabels : productionLabels);
    assert.equal(Boolean(exports.findFoodById("edamame")), isTestEnvironment);
  }
});

test("the local review workflow recognizes the new edamame label", async () => {
  const labels = await reviewLabels();
  assert.equal(labels.size, testLabels.length);
  assert.equal(labels.get("edamame"), "枝豆（調理済み）");
});

test("local learning defaults to test labels and keeps explicit production learning on its original labels", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "bodymake-labels-test-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const data = path.join(temporary, "data");
  await mkdir(data);
  const productionModelFile = fileURLToPath(new URL("lib/food-ai/deployed-calibration.json", root));
  const testModelFile = fileURLToPath(new URL("lib/food-ai/test-calibration.json", root));
  const originalProduction = await readFile(productionModelFile, "utf8");
  const originalTest = await readFile(testModelFile, "utf8");
  for (const production of [false, true]) {
    const artifacts = path.join(temporary, production ? "production" : "test");
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("scripts/food-ai/learn.mjs", root)),
      "--data", data, "--artifacts", artifacts, "--prepare-only",
      ...(production ? ["--deployment", productionModelFile] : []),
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(path.join(artifacts, "evaluation.json"), "utf8"));
    assert.equal(Object.keys(report.classCounts).length, production ? productionLabels.length : testLabels.length);
    assert.equal(Object.hasOwn(report.classCounts, "edamame"), !production);
    assert.equal(report.paths.deployment, production ? productionModelFile : testModelFile);
    assert.equal(report.promoted, false);
  }
  assert.equal(await readFile(productionModelFile, "utf8"), originalProduction);
  assert.equal(await readFile(testModelFile, "utf8"), originalTest);
});
