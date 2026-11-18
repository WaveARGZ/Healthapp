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
assert.ok(searchFoodGroups(foods, "とりむね", "すべて").groups.some((group) => group.name.startsWith("鶏むね肉")));
assert.ok(searchFoodGroups(foods, "玉子焼き", "すべて").groups.some((group) => group.name.includes("厚焼きたまご")));
const related = searchFoodGroups(foods, "ツナサラダ", "すべて");
assert.equal(related.usedRelated, true);
assert.deepEqual(related.relatedTerms, ["ツナ", "サラダ"]);
assert.ok(related.groups.some((group) => group.name === "ツナ缶"));
assert.ok(related.groups.some((group) => group.name.includes("サラダ")));
const kimchi = searchFoodGroups(foods, "豚キムチ", "すべて");
assert.equal(kimchi.usedRelated, true);
assert.ok(kimchi.relatedTerms.includes("キムチ"));
assert.equal(searchFoodGroups(foods, "該当しない食品", "すべて").groups.length, 0);
assert.ok(searchFoodGroups(foods, "チャーハン", "調理済み料理").groups.some((group) => group.name.includes("チャーハン")));
assert.ok(searchFoodGroups(foods, "バナナ", "果物").groups.every((group) => group.variants.every((food) => food.category === "果物")));
assert.equal(searchFoodGroups(foods, "シャオエッセン", "すべて").groups[0]?.name, "シャウエッセン");

console.log(`${foods.length} records grouped into ${all.groups.length} Japanese display names`);
