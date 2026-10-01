import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchFoodGroups } from "../lib/food-catalog-groups.mjs";

const curated = JSON.parse(readFileSync("lib/data/food-library.json", "utf8")).foods;
const extended = JSON.parse(readFileSync("public/data/food-library-extended.json", "utf8")).foods;
const foods = [...curated, ...extended];

const all = searchFoodGroups(foods, "", "すべて");
assert.equal(all.matchingRecords, foods.length);
assert.equal(new Set(all.groups.map((group) => group.name)).size, all.groups.length);
assert.ok(all.groups.length < foods.length);

const beef = searchFoodGroups(foods, "牛肉", "すべて");
const plainBeef = beef.groups.find((group) => group.name === "牛肉");
assert.ok(plainBeef && plainBeef.variants.length > 1);
assert.ok(new Set(plainBeef.variants.map((food) => JSON.stringify(food.per100g))).size > 1);
assert.equal(beef.groups.filter((group) => group.name === "牛肉").length, 1);

const example = extended.find((food) => food.sourceDescription === "Milk, low fat (1%)");
assert.ok(example);
const duplicate = { ...example, id: "duplicate", fdcId: -1 };
const differentNutrition = { ...example, id: "different-nutrition", fdcId: -2, per100g: { ...example.per100g, calories: example.per100g.calories + 1 } };
const grouped = searchFoodGroups([example, duplicate, differentNutrition], "", "すべて");
assert.equal(grouped.groups.length, 1);
assert.equal(grouped.groups[0].variants.length, 2);

const dairy = searchFoodGroups(foods, "牛乳", "乳製品・飲み物");
assert.ok(dairy.groups.length > 0);
assert.ok(dairy.groups.every((group) => group.variants.every((food) => food.category === "乳製品・飲み物")));

for (const spelling of ["白米", "しろごはん", "おこめ", "ライス"]) {
  assert.equal(searchFoodGroups(foods, spelling, "すべて").groups[0]?.name, "白ごはん");
}
assert.equal(searchFoodGroups(foods, "みそしる", "すべて").groups[0]?.name, "味噌汁・豆腐のスープ");
assert.ok(searchFoodGroups(foods, "とりにく", "すべて").groups.some((group) => group.name.includes("鶏肉")));
assert.ok(searchFoodGroups(foods, "スパゲティ", "すべて").groups.some((group) => group.name.includes("パスタ")));
assert.ok(searchFoodGroups(foods, "ステーキ", "すべて").groups.some((group) => group.name === "牛肉"));
assert.ok(searchFoodGroups(foods, "カレライス", "すべて").groups.some((group) => group.name === "ビーフカレーライス"));
assert.ok(searchFoodGroups(foods, "からあげ", "すべて").groups.some((group) => group.name.startsWith("フライドチキン")));

const curryWithRice = searchFoodGroups(foods, "ごはん カレー", "すべて");
assert.ok(curryWithRice.groups.some((group) => group.name === "ビーフカレーライス"));
assert.ok(curryWithRice.groups.every((group) => !group.name.includes("ごはんなし")));

const typo = searchFoodGroups(foods, "チキンカレイ", "すべて");
assert.equal(typo.usedFuzzy, true);
assert.ok(typo.groups.some((group) => group.name === "チキンカレーライス"));
assert.ok(searchFoodGroups(foods, "味そ汁", "すべて").groups.some((group) => group.name.startsWith("味噌汁")));
assert.ok(searchFoodGroups(foods, "チキン カレイ", "すべて").groups.some((group) => group.name === "チキンカレーライス"));
assert.equal(searchFoodGroups(foods, "チキン", "すべて").usedFuzzy, false);

console.log(`${foods.length} records grouped into ${all.groups.length} Japanese display names; duplicates are selectable variants`);
