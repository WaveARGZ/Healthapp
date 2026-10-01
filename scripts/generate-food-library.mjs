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
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return new Map(JSON.parse(json)[collectionName].map((food) => [food.fdcId, food]));
}

const surveyFoods = foodsFromZip(surveyZip, "surveyDownload.json", "SurveyFoods");
const legacyFoods = foodsFromZip(
  legacyZip,
  "FoodData_Central_sr_legacy_food_json_2018-04.json",
  "SRLegacyFoods",
);

const ids = new Set();
const foods = foodSelections.map(([id, name, category, fdcId, suggestedGrams, aliases]) => {
  if (ids.has(id)) throw new Error(`Duplicate food ID: ${id}`);
  ids.add(id);
  const sourceDataset = surveyFoods.has(fdcId) ? "FNDDS 2021–2023" : "SR Legacy 2018";
  const sourceFood = surveyFoods.get(fdcId) ?? legacyFoods.get(fdcId);
  if (!sourceFood) throw new Error(`FDC ID ${fdcId} was not found for ${name}`);
  const nutrients = new Map(sourceFood.foodNutrients.map(({ nutrient, amount }) => [nutrient.id, amount]));
  const calories = nutrients.get(1008);
  const proteinG = nutrients.get(1003);
  const fatG = nutrients.get(1004);
  const carbsG = nutrients.get(1005);
  if ([calories, proteinG, fatG, carbsG].some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    throw new Error(`Energy or PFC is missing for ${name} (FDC ${fdcId})`);
  }
  return {
    id,
    name,
    category,
    aliases,
    suggestedGrams,
    sourceDataset,
    fdcId,
    sourceDescription: sourceFood.description,
    per100g: {
      calories,
      proteinG,
      fatG,
      carbsG,
    },
  };
});

const output = {
  version: "usda-fndds-2021-2023-sr-legacy-2018-v1",
  sourceName: "USDA FoodData Central",
  sourceUrl: "https://fdc.nal.usda.gov/",
  license: "CC0 1.0 Universal",
  basis: "100g当たり。1食の初期目安量はBodyMake独自設定で変更できます。",
  foods,
};
const outputPath = resolve("lib/data/food-library.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`${foods.length} foods written to ${outputPath}`);
