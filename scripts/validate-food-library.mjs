import { readFileSync } from "node:fs";

const curated = JSON.parse(readFileSync("lib/data/food-library.json", "utf8"));
const extended = JSON.parse(readFileSync("public/data/food-library-extended.json", "utf8"));
if (curated.version !== extended.version) throw new Error("Food library versions do not match");
if (curated.foods.length < 180 || extended.foods.length < 2500) throw new Error("Food library is unexpectedly small");

const ids = new Set();
const sourceIds = new Set();
for (const food of [...curated.foods, ...extended.foods]) {
  if (ids.has(food.id)) throw new Error(`Duplicate food ID: ${food.id}`);
  ids.add(food.id);
  const sourceId = food.foodCode ? `mext:${food.foodCode}` : `fdc:${food.fdcId}`;
  if (sourceIds.has(sourceId)) throw new Error(`Duplicate source ID: ${sourceId}`);
  sourceIds.add(sourceId);
  if (!food.name || !food.category || !food.sourceDataset || food.suggestedGrams <= 0) {
    throw new Error(`Incomplete food metadata: ${food.id}`);
  }
  if (food.id.startsWith("mext-") && (!/^\d{5}$/.test(food.foodCode) || !/[\u3040-\u30ff\u3400-\u9fff]/.test(food.name) || /[A-Za-z]/.test(`${food.name} ${food.sourceDescription ?? ""}`))) {
    throw new Error(`Invalid Japanese label or food number: ${food.id}`);
  }
  if (["calories", "proteinG", "fatG", "carbsG"].some((key) =>
    !Number.isFinite(food.per100g?.[key]) || food.per100g[key] < 0)) {
    throw new Error(`Invalid nutrition values: ${food.id}`);
  }
}

for (const excluded of ["rice-black-beans", "falafel", "sandwich-turkey", "corn-tortilla"]) {
  if (curated.foods.some((food) => food.id === excluded)) throw new Error(`US-specific quick pick remains: ${excluded}`);
}
for (const code of ["01088", "04046", "07107", "18057"]) {
  if (!extended.foods.some((food) => food.foodCode === code)) throw new Error(`Missing representative Japanese food: ${code}`);
}

console.log(`${curated.foods.length} Japanese quick picks + ${extended.foods.length} MEXT foods = ${ids.size} validated foods`);
