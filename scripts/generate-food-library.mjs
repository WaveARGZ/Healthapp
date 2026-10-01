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
const nutrientsFor = (food) => new Map(food.foodNutrients.map(({ nutrient, amount }) => [nutrient.id, amount]));
const nutrientValues = (food) => {
  const nutrients = nutrientsFor(food);
  const calories = nutrients.get(1008);
  const proteinG = nutrients.get(1003);
  const fatG = nutrients.get(1004);
  const carbsG = nutrients.get(1005);
  if ([calories, proteinG, fatG, carbsG].some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) return null;
  return { calories, proteinG, fatG, carbsG };
};

const foods = foodSelections.map(([id, name, category, fdcId, suggestedGrams, aliases]) => {
  if (ids.has(id)) throw new Error(`Duplicate food ID: ${id}`);
  ids.add(id);
  const sourceDataset = surveyFoods.has(fdcId) ? "FNDDS 2021–2023" : "SR Legacy 2018";
  const sourceFood = surveyFoods.get(fdcId) ?? legacyFoods.get(fdcId);
  if (!sourceFood) throw new Error(`FDC ID ${fdcId} was not found for ${name}`);
  const per100g = nutrientValues(sourceFood);
  if (!per100g) {
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
    per100g,
  };
});

// The complete FNDDS survey is kept separate from the small Japanese quick-pick list.
// These are keyword hints, not automatic translations of full dish names.
const searchTerms = [
  [/rice/i, "米 ごはん ご飯 ライス"],
  [/fried rice/i, "チャーハン 炒飯"],
  [/curry/i, "カレー"],
  [/sushi/i, "寿司 すし"],
  [/ramen/i, "ラーメン"],
  [/noodle|lo mein|chow mein/i, "麺 めん"],
  [/pasta|spaghetti|macaroni|lasagna/i, "パスタ スパゲッティ"],
  [/soup|broth|stew/i, "スープ 汁物"],
  [/miso/i, "味噌 みそ"],
  [/tofu/i, "豆腐 とうふ"],
  [/soybean|soy bean|edamame/i, "大豆 枝豆"],
  [/bean|lentil|chickpea/i, "豆 まめ"],
  [/chicken/i, "鶏肉 チキン"],
  [/turkey/i, "七面鳥 ターキー"],
  [/beef|steak/i, "牛肉 ビーフ"],
  [/pork/i, "豚肉 ポーク"],
  [/lamb/i, "羊肉 ラム"],
  [/fish/i, "魚 さかな"],
  [/salmon/i, "鮭 サーモン"],
  [/tuna/i, "マグロ ツナ"],
  [/shrimp|prawn/i, "海老 エビ えび"],
  [/crab/i, "蟹 カニ かに"],
  [/\beggs?\b|omelet/i, "卵 たまご 玉子"],
  [/vegetable/i, "野菜 やさい"],
  [/salad/i, "サラダ"],
  [/potato/i, "じゃがいも ポテト"],
  [/sweet potato/i, "さつまいも"],
  [/tomato/i, "トマト"],
  [/carrot/i, "にんじん 人参"],
  [/broccoli/i, "ブロッコリー"],
  [/spinach/i, "ほうれん草"],
  [/avocado/i, "アボカド"],
  [/banana/i, "バナナ"],
  [/apple/i, "りんご リンゴ"],
  [/orange/i, "オレンジ"],
  [/strawberr/i, "いちご イチゴ"],
  [/blueberr/i, "ブルーベリー"],
  [/fruit/i, "果物 フルーツ"],
  [/milk/i, "牛乳 ミルク"],
  [/yogurt/i, "ヨーグルト"],
  [/cheese/i, "チーズ"],
  [/bread|toast|bagel/i, "パン トースト"],
  [/sandwich/i, "サンドイッチ"],
  [/burger/i, "ハンバーガー"],
  [/pizza/i, "ピザ"],
  [/taco|burrito|tortilla/i, "タコス ブリトー トルティーヤ"],
  [/oatmeal|\boats?\b|granola|cereal/i, "オートミール シリアル"],
  [/coffee/i, "コーヒー"],
  [/\btea\b/i, "お茶 紅茶"],
  [/juice/i, "ジュース"],
  [/chocolate/i, "チョコレート"],
  [/cookie|biscuit/i, "クッキー ビスケット"],
  [/cake/i, "ケーキ"],
  [/ice cream/i, "アイスクリーム"],
  [/fried|deep-fried/i, "揚げ物 フライ"],
  [/grilled|broiled/i, "焼き グリル"],
  [/boiled|steamed/i, "ゆで 蒸し"],
  [/\braw\b/i, "生 なま"],
];

function categoryFor(food) {
  const sourceCategory = food.wweiaFoodCategory?.wweiaFoodCategoryDescription ?? food.foodCategory?.description ?? "";
  if (/^Dairy and Egg Products$/i.test(sourceCategory)) return /\begg\b/i.test(food.description) ? "卵・大豆・豆" : "乳製品・飲み物";
  if (/^Cereal Grains and Pasta$/i.test(sourceCategory)) return /pasta|noodle|macaroni/i.test(food.description) ? "麺・パスタ" : "穀物・朝食";
  if (/rice|grain mixed dishes/i.test(sourceCategory)) return "ごはん・米料理";
  if (/pasta|noodle|macaroni/i.test(sourceCategory)) return "麺・パスタ";
  if (/soup|broth/i.test(sourceCategory)) return "スープ";
  if (/fish|seafood|shellfish/i.test(sourceCategory)) return "魚介料理";
  if (/chicken|poultry|meat|beef|pork|lamb|sausage|hot dog/i.test(sourceCategory)) return "肉料理";
  if (/egg|bean|legume|soy/i.test(sourceCategory)) return "卵・大豆・豆";
  if (/vegetable|salad|potato/i.test(sourceCategory)) return "野菜・サラダ";
  if (/fruit|melon|berr/i.test(sourceCategory)) return "果物";
  if (/bread|sandwich|burger|pizza|taco|burrito|pancake|waffle/i.test(sourceCategory)) return "パン・軽食";
  if (/oat|cereal|grain/i.test(sourceCategory)) return "穀物・朝食";
  if (/milk|yogurt|cheese|coffee|tea|juice|drink|water|soda|beverage/i.test(sourceCategory)) return "乳製品・飲み物";
  if (/^Beverages$/i.test(sourceCategory)) return "乳製品・飲み物";
  if (/cookie|cake|pie|candy|dessert|sweet|chocolate|ice cream|snack|doughnut|nuts|seeds/i.test(sourceCategory)) return "菓子・間食";
  if (/^Baked Products$/i.test(sourceCategory)) return "パン・軽食";
  return "その他";
}

const curatedFdcIds = new Set(foods.map((food) => food.fdcId));
const extendedFoods = [
  ...[...surveyFoods.values()].map((food) => [food, "FNDDS 2021–2023"]),
  ...[...legacyFoods.values()].map((food) => [food, "SR Legacy 2018"]),
].flatMap(([food, sourceDataset]) => {
  if (curatedFdcIds.has(food.fdcId)) return [];
  const per100g = nutrientValues(food);
  if (!per100g) return [];
  return [{
    id: `fdc-${food.fdcId}`,
    name: food.description,
    category: categoryFor(food),
    aliases: searchTerms.filter(([pattern]) => pattern.test(food.description)).map(([, japanese]) => japanese).join(" "),
    suggestedGrams: 100,
    sourceDataset,
    fdcId: food.fdcId,
    per100g,
  }];
});

const output = {
  version: "usda-fndds-2021-2023-sr-legacy-2018-v2",
  sourceName: "USDA FoodData Central",
  sourceUrl: "https://fdc.nal.usda.gov/",
  license: "CC0 1.0 Universal",
  basis: "100g当たり。1食の初期目安量はBodyMake独自設定で変更できます。",
  foods,
};
const outputPath = resolve("lib/data/food-library.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
const extendedOutputPath = resolve("public/data/food-library-extended.json");
await mkdir(dirname(extendedOutputPath), { recursive: true });
await writeFile(extendedOutputPath, `${JSON.stringify({
  version: output.version,
  sourceName: output.sourceName,
  sourceUrl: output.sourceUrl,
  license: output.license,
  foods: extendedFoods,
})}\n`);
console.log(`${foods.length} Japanese quick picks and ${extendedFoods.length} additional foods written`);
