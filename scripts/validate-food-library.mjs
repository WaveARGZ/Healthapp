import { readFileSync } from "node:fs";

const curated = JSON.parse(readFileSync("lib/data/food-library.json", "utf8"));
const extended = JSON.parse(readFileSync("public/data/food-library-extended.json", "utf8"));
if (curated.version !== extended.version) throw new Error("Food library versions do not match");
if (curated.foods.length < 200 || extended.foods.length < 13_000) throw new Error("Food library is unexpectedly small");

const ids = new Set();
const fdcIds = new Set();
for (const food of [...curated.foods, ...extended.foods]) {
  if (ids.has(food.id) || fdcIds.has(food.fdcId)) throw new Error(`Duplicate food ID: ${food.id}`);
  ids.add(food.id);
  fdcIds.add(food.fdcId);
  if (!food.name || !food.category || !food.sourceDataset || food.suggestedGrams <= 0) {
    throw new Error(`Incomplete food metadata: ${food.id}`);
  }
  if (food.id.startsWith("fdc-") && (!/[\u3040-\u30ff\u3400-\u9fff]/.test(food.name) || !food.sourceDescription)) {
    throw new Error(`Japanese label or original source is missing: ${food.id}`);
  }
  if (["calories", "proteinG", "fatG", "carbsG"].some((key) =>
    !Number.isFinite(food.per100g?.[key]) || food.per100g[key] < 0)) {
    throw new Error(`Invalid nutrition values: ${food.id}`);
  }
}

const representativeNames = new Map([
  ["Tuna salad, made with mayonnaise", "マグロ（サラダ）"],
  ["Cream of wheat, regular or quick, made with water, no added fat", "小麦のおかゆ（油脂追加なし）"],
  ["Green peas, raw", "グリーンピース（生）"],
  ["Alfredo sauce", "アルフレッドソース"],
]);
for (const [sourceDescription, expected] of representativeNames) {
  const actual = extended.foods.find((food) => food.sourceDescription === sourceDescription)?.name;
  if (actual !== expected) throw new Error(`Unexpected Japanese name for ${sourceDescription}: ${actual}`);
}

console.log(`${curated.foods.length} Japanese picks + ${extended.foods.length} details = ${ids.size} validated foods`);
