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
  if (["calories", "proteinG", "fatG", "carbsG"].some((key) =>
    !Number.isFinite(food.per100g?.[key]) || food.per100g[key] < 0)) {
    throw new Error(`Invalid nutrition values: ${food.id}`);
  }
}

console.log(`${curated.foods.length} Japanese picks + ${extended.foods.length} details = ${ids.size} validated foods`);
