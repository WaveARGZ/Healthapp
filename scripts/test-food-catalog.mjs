import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchFoodGroups } from "../lib/food-catalog-groups.mjs";

const curated = JSON.parse(readFileSync("lib/data/food-library.json", "utf8")).foods;
const extended = JSON.parse(readFileSync("public/data/food-library-extended.json", "utf8")).foods;
const foods = [...curated, ...extended];

const all = searchFoodGroups(foods, "", "すべて");
assert.equal(all.matchingRecords, foods.length);
assert.equal(new Set(all.groups.map((group) => group.name)).size, all.groups.length);
assert.equal(all.groups.length, foods.length);

const example = extended.find((food) => food.foodCode === "01088");
assert.ok(example);
const duplicate = { ...example, id: "duplicate", foodCode: "99998" };
const differentNutrition = { ...example, id: "different-nutrition", foodCode: "99999", per100g: { ...example.per100g, calories: example.per100g.calories + 1 } };
const grouped = searchFoodGroups([example, duplicate, differentNutrition], "", "すべて");
assert.equal(grouped.groups.length, 1);
assert.equal(grouped.groups[0].variants.length, 2);

for (const spelling of ["白米", "しろごはん", "おこめ", "ライス"]) {
  assert.equal(searchFoodGroups(foods, spelling, "すべて").groups[0]?.name, "白ごはん");
}
assert.ok(searchFoodGroups(foods, "おにぎり", "すべて").groups.some((group) => group.name.includes("おにぎり")));
assert.ok(searchFoodGroups(foods, "納豆", "すべて").groups.some((group) => group.name.includes("糸引き納豆")));
assert.ok(searchFoodGroups(foods, "チキンカレイ", "すべて").groups.some((group) => group.name === "チキンカレーライス"));
assert.ok(searchFoodGroups(foods, "チャーハン", "調理済み料理").groups.some((group) => group.name.includes("チャーハン")));
assert.ok(searchFoodGroups(foods, "バナナ", "果物").groups.every((group) => group.variants.every((food) => food.category === "果物")));
assert.equal(searchFoodGroups(foods, "シャオエッセン", "すべて").groups[0]?.name, "シャウエッセン");
assert.ok(searchFoodGroups(foods, "鶏肉カレー", "すべて").groups.some((group) => group.name === "チキンカレーライス"));
assert.ok(searchFoodGroups(foods, "とりにくのカレー", "すべて").groups.some((group) => group.name === "チキンカレーライス"));
assert.ok(searchFoodGroups(foods, "鶏肉、カレー", "すべて").groups.some((group) => group.name === "チキンカレーライス"));
assert.ok(searchFoodGroups(foods, "焼き飯", "すべて").groups.some((group) => group.name === "中国料理 菜類 チャーハン"));
assert.ok(searchFoodGroups(foods, "プチトマト", "すべて").groups.some((group) => group.name.includes("ミニトマト")));
assert.ok(searchFoodGroups(foods, "たまごやき", "すべて").groups.some((group) => group.name.includes("厚焼きたまご")));
assert.ok(searchFoodGroups(foods, "豚カツ", "すべて").groups.every((group) => group.name.includes("とんかつ")));
assert.ok(searchFoodGroups(foods, "鶏もも肉", "すべて").groups.some((group) => group.name.includes("にわとり") && group.name.includes("もも")));
assert.equal(searchFoodGroups(foods, "焼鮭", "すべて").groups[0]?.name, "焼き鮭");
assert.equal(searchFoodGroups([curated.find((food) => food.id === "salad-chicken")], "サラダチキン", "すべて").groups.length, 0);

const chickenAndEgg = searchFoodGroups(foods, "鶏肉と卵の炒め物", "すべて");
assert.deepEqual(chickenAndEgg.searchTerms, ["鶏肉", "卵"]);
assert.equal(chickenAndEgg.groups.length, 0);
assert.ok(chickenAndEgg.inferredGroups.some((group) => group.matchedTerms?.includes("鶏肉")));
assert.ok(chickenAndEgg.inferredGroups.some((group) => group.matchedTerms?.includes("卵")));
assert.ok(chickenAndEgg.inferredGroups.every((group) => !group.name.includes("かも あひる")));
assert.ok(searchFoodGroups(foods, "鶏肉", "すべて").groups.every((group) => !group.name.includes("かも あひる")));

const tomatoTunaPasta = searchFoodGroups(foods, "トマトとツナのパスタ", "すべて");
assert.deepEqual(tomatoTunaPasta.searchTerms, ["トマト", "ツナ", "パスタ"]);
assert.equal(tomatoTunaPasta.groups.length, 0);
assert.ok(tomatoTunaPasta.inferredGroups.some((group) => group.name === "ツナ缶"));
assert.ok(tomatoTunaPasta.inferredGroups.every((group) => group.inferred && group.matchedTerms?.length));

const salmonOnigiri = searchFoodGroups(foods, "鮭おにぎり", "すべて");
assert.equal(salmonOnigiri.groups.length, 0);
assert.ok(salmonOnigiri.inferredGroups.some((group) => group.matchedTerms?.includes("鮭")));
assert.ok(salmonOnigiri.inferredGroups.some((group) => group.matchedTerms?.includes("おにぎり")));
assert.ok(!searchFoodGroups(foods, "サラダチキン", "すべて").inferredGroups.some((group) => group.name === "チキンサラダ（ドレッシングなし）"));
assert.equal(searchFoodGroups(foods, "チキンカレイ", "すべて").usedFuzzy, true);
const pastaCategory = searchFoodGroups(foods, "トマトとツナのパスタ", "麺・パスタ").inferredGroups;
assert.ok(pastaCategory.length > 0);
assert.ok(pastaCategory.every((group) => group.variants.every((food) => food.category === "麺・パスタ")));

console.log(`${foods.length} records grouped into ${all.groups.length} Japanese display names`);
