import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { foodSelections } from "../lib/data/food-selections.mjs";

const surveyZip = process.argv[2];
const legacyZip = process.argv[3];
if (!surveyZip || !legacyZip) {
  throw new Error("USDA FNDDS 2021-2023 と SR Legacy のZIPを指定してください。READMEを参照してください。");
}

function foodsFromZip(zipPath, memberName, collectionName) {
  const json = execFileSync("unzip", ["-p", resolve(zipPath), memberName], {
    encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  });
  return new Map(JSON.parse(json)[collectionName].map((food) => [food.fdcId, food]));
}

const surveyFoods = foodsFromZip(surveyZip, "surveyDownload.json", "SurveyFoods");
const legacyFoods = foodsFromZip(legacyZip, "FoodData_Central_sr_legacy_food_json_2018-04.json", "SRLegacyFoods");
const nutrientsFor = (food) => new Map(food.foodNutrients.map(({ nutrient, amount }) => [nutrient.id, amount]));
const excludedFromJapanQuickPicks = new Set([
  "rice-chicken-plain", "rice-chicken-soy", "rice-black-beans",
  "pad-thai", "pad-thai-chicken", "pho-meat", "lo-mein-chicken",
  "lentil-curry-rice", "chili-beef-beans", "chili-chicken-beans",
  "hummus", "falafel", "lentil-curry", "falafel-sandwich",
  "corn-tortilla", "flour-tortilla", "sandwich-turkey",
  "taco-beef", "burrito-chicken", "soup-lentil", "soup-pho",
  "beef-roast", "mac-cheese",
]);

const foods = foodSelections.filter(([id]) => !excludedFromJapanQuickPicks.has(id)).map(([id, name, category, fdcId, suggestedGrams, aliases]) => {
  const sourceFood = surveyFoods.get(fdcId) ?? legacyFoods.get(fdcId);
  if (!sourceFood) throw new Error(`FDC ID ${fdcId} was not found for ${name}`);
  const nutrients = nutrientsFor(sourceFood);
  const per100g = {
    calories: nutrients.get(1008),
    proteinG: nutrients.get(1003),
    fatG: nutrients.get(1004),
    carbsG: nutrients.get(1005),
  };
  if (Object.values(per100g).some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    throw new Error(`Energy or PFC is missing for ${name} (FDC ${fdcId})`);
  }
  return {
    id, name, category, aliases, suggestedGrams,
    sourceDataset: surveyFoods.has(fdcId) ? "米国農務省・食事調査データ" : "米国農務省・標準食品データ",
    fdcId, per100g,
  };
});

const output = {
  version: "bodymake-jp-2023-v1",
  sourceName: "米国農務省・食品データベース",
  sourceUrl: "https://fdc.nal.usda.gov/",
  license: "CC0 1.0 Universal",
  basis: "100g当たり。1食の初期目安量はBodyMake独自設定で変更できます。",
  foods,
};
const outputPath = resolve("lib/data/food-library.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`${foods.length} Japanese quick picks written. Detailed food data is generated separately from MEXT.`);
