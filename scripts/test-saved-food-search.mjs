import assert from "node:assert/strict";
import test from "node:test";
import { searchSavedMealFoods } from "../lib/meals/saved-food-search.ts";

const savedMeal = (id, name, createdAt, nutrition = {}) => ({
  id, mealType: "lunch", name, recordedAt: "2026-11-17", createdAt,
  items: [{ id: `food-${id}`, name, ...nutrition }],
});

test("saved meals appear only for matching searches with their recorded nutrients", () => {
  const meal = savedMeal("1", "カレーライス（200g）", "2026-11-17T10:00:00Z", {
    calories: 320, proteinG: 12, fatG: 8, carbsG: 50, portionGrams: 200,
  });
  assert.equal(searchSavedMealFoods([meal], "").length, 0);
  assert.equal(searchSavedMealFoods([meal], "ラーメン").length, 0);
  assert.deepEqual(searchSavedMealFoods([meal], "かれーライス")[0]?.food, meal.items[0]);
});

test("repeated identical meals collapse while distinct saved nutrition remains selectable", () => {
  const older = savedMeal("old", "卵焼き", "2026-11-15T10:00:00Z", { calories: 120, proteinG: 8 });
  const newer = savedMeal("new", "卵焼き", "2026-11-17T10:00:00Z", { calories: 120, proteinG: 8 });
  const different = savedMeal("other", "卵焼き", "2026-11-16T10:00:00Z", { calories: 150, proteinG: 9 });
  assert.deepEqual(searchSavedMealFoods([older, different, newer], "卵焼き").map((result) => result.id), ["new:food-new", "other:food-other"]);
});

test("older meal records without item arrays can be reused", () => {
  const { items, ...legacy } = savedMeal("legacy", "焼き魚", "2026-11-10T10:00:00Z", { calories: 210 });
  void items;
  legacy.calories = 210;
  assert.deepEqual(searchSavedMealFoods([legacy], "焼き魚")[0]?.food, {
    id: "legacy", name: "焼き魚", calories: 210, proteinG: undefined, fatG: undefined, carbsG: undefined,
  });
});
