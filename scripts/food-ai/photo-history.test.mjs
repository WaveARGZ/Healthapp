import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(relative, modules = {}, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require(id) { assert.ok(Object.hasOwn(modules, id), id); return modules[id]; }, ...globals });
  return exports;
}
const history = load("../../lib/food-ai/photo-history.ts");
const base = [
  { id: "rice", clipLabel: "white rice", food: { name: "白ごはん（100g）", calories: 156, portionGrams: 100 } },
  { id: "ramen", clipLabel: "ramen noodles", food: { name: "ラーメン", calories: 400, portionGrams: 300 } },
];
const meal = (name, values = {}, createdAt = "2026-11-22T00:00:00Z") => ({ id: name, name, ...values, createdAt });
const plain = (value) => JSON.parse(JSON.stringify(value));

test("a saved yakisoba correction becomes its own candidate, with prior unknown nutrients preserved", () => {
  const input = [meal("焼きそば（300g）", { items: [{ id: "food", name: "焼きそば（300g）", calories: 0, portionGrams: 300 }] })];
  const candidates = history.buildPhotoHistory(input, base);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].origin, "history");
  assert.equal(candidates[0].food.name, "焼きそば");
  assert.match(candidates[0].clipLabel, /yakisoba/);
  assert.notEqual(candidates[0].id, "soba");
  assert.equal(candidates[0].food.calories, 0);
  assert.equal(Object.hasOwn(candidates[0].food, "fatG"), false);
  assert.equal(input[0].items[0].name, "焼きそば（300g）", "original record remains unchanged");
});

test("each user's current records are the only source, without a cache surviving removal", () => {
  assert.equal(history.buildPhotoHistory([meal("焼きそば")], base).length, 1);
  assert.equal(history.buildPhotoHistory([], base).length, 0);
  assert.equal(history.buildPhotoHistory([meal("オムライス")], base)[0].food.name, "オムライス");
});

test("recipe variants stay distinct, duplicate prompts are removed, and only valid values are reused", () => {
  const candidates = history.buildPhotoHistory([
    meal("焼きそば", { calories: 100 }, "2026-11-22T02:00:00Z"),
    meal("焼そば", { calories: 90 }), meal("焼きそば（ソース）"), meal("白ごはん（100g）"),
    meal("constructor", { calories: Number.NaN, proteinG: -1, fatG: 0, portionGrams: Infinity }),
  ], base);
  assert.equal(candidates.filter((food) => food.clipLabel === "yakisoba, Japanese stir-fried noodles").length, 1);
  assert.ok(candidates.some((food) => food.food.name === "焼きそば(ソース)"));
  assert.ok(!candidates.some((food) => food.food.name === "白ごはん"));
  const unusual = candidates.find((food) => food.food.name === "constructor");
  assert.equal(typeof unusual.clipLabel, "string");
  assert.deepEqual(plain(unusual.food), { name: "constructor", fatG: 0 });
});

test("meal totals are not copied into individual dishes; recent comparison inputs are bounded", () => {
  const dishes = history.buildPhotoHistory([meal("複数の料理", { calories: 900, items: [
    { name: "焼きそば", calories: 300 }, { name: "手作りの副菜", proteinG: 1 },
  ] })], base);
  assert.equal(dishes[0].food.calories, 300);
  assert.equal(Object.hasOwn(dishes[1].food, "calories"), false);
  const many = history.buildPhotoHistory(Array.from({ length: 100 }, (_, i) => meal(`料理${i}`, {}, new Date(i * 1000).toISOString())), base);
  assert.equal(many.length, 20);
  assert.equal(many[0].food.name, "料理99");
});

function analyzer({ streaming = false, imageScores } = {}) {
  const calls = [], calibrated = [];
  const raw = (labels) => imageScores ?? labels.map((_, i) => i === 0 ? .1 : i === 1 ? .2 : .7 / (labels.length - 2));
  const modules = {
    "@/lib/food-ai/food-catalog": { foodCatalog: base },
    "@/lib/food-ai/photo-history": history,
    "@/lib/cloud/config": { useTestFoodModel: streaming },
    "@/lib/food-ai/deployed-calibration.json": {}, "@/lib/food-ai/test-calibration.json": {},
    "@/lib/food-ai/food-calibration.mjs": { FOOD_BASE_MODEL: "fixed-model", FOOD_BASE_REVISION: "fixed-revision",
      applyFoodCalibration(scores, ids) { calibrated.push({ scores, ids }); return scores; } },
    "@/lib/food-ai/clip-features.mjs": {
      async extractClipFeatures(_classifier, _image, labels) { calls.push(labels); return { scores: raw(labels), embedding: [1, ...Array(511).fill(0)] }; },
      applyEmbeddingCalibration(scores, embedding, ids, labels) { calibrated.push({ scores, ids, labels, embedding }); return scores; },
    },
    "@huggingface/transformers": { env: { version: "4.3.0" }, RawImage: {},
      async pipeline() { return async (_image, labels) => { calls.push(labels); return labels.map((label, i) => ({ label, score: raw(labels)[i] })); }; } },
  };
  const api = load("../../lib/food-ai/food-photo-analyzer.ts", modules, {
    window: { location: { hostname: "localhost" } }, AbortSignal,
    fetch: async () => ({ ok: true, json: async () => ({ schemaVersion: 2, status: "trained" }) }),
  });
  return { ...api, calls, calibrated };
}

for (const streaming of [false, true]) test(`next photo compares saved yakisoba while preserving the existing correction head (streaming=${streaming})`, async () => {
  const h = analyzer({ streaming });
  const before = await h.analyzeFoodPhotoDetailed({ synthetic: true });
  assert.equal(before.historyCandidates.length, 0);
  const after = await h.analyzeFoodPhotoDetailed({ synthetic: true }, undefined, { previousMeals: [meal("焼きそば（300g）")] });
  assert.match(h.calls[1].at(-1), /yakisoba/);
  assert.equal(h.calls[1].length, 3);
  assert.equal(after.recommendedCandidateId, after.historyCandidates[0].id);
  assert.equal(after.historyCandidates[0].food.name, "焼きそば");
  assert.deepEqual(plain(after.candidates.map((food) => food.id)), ["ramen", "rice"]);
  assert.equal(after.scores.length, 2, "base-score contract does not become a free-form label set");
  assert.deepEqual(plain(h.calibrated.at(-1).ids), ["rice", "ramen"]);
  assert.ok(Math.abs(after.scores[0] - 1 / 3) < 1e-10);
  await h.analyzeFoodPhotoDetailed({ synthetic: true }, undefined, { previousMeals: [] });
  assert.equal(h.calls[2].length, 2, "removed/history from another account must not be remembered");
});

test("frequent registration does not override the picture's stronger evidence for another dish", async () => {
  const h = analyzer({ imageScores: [.9, .09, .01] });
  const result = await h.analyzeFoodPhotoDetailed({ synthetic: true }, undefined, {
    previousMeals: Array.from({ length: 50 }, () => meal("焼きそば")),
  });
  assert.equal(result.historyCandidates.length, 1);
  assert.equal(result.recommendedCandidateId, "rice");
  assert.equal(h.calls[0].length, 3);
});
