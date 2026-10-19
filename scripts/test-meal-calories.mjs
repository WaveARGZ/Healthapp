import assert from "node:assert/strict";
import test from "node:test";
import { summarizeDailyCalories } from "../lib/utils/meal-calories.ts";

const day = "2026-10-13";
const meal = (id, recordedAt, calories, items) => ({ id, recordedAt, calories, items });

test("今日の食事だけを合計し、料理と食事のカロリーを二重計上しない", () => {
  assert.deepEqual(summarizeDailyCalories([
    meal("breakfast", day, 310, [{ calories: 200 }, { calories: 110 }]),
    meal("lunch", day, 520),
    meal("yesterday", "2026-10-12", 900),
  ], day), { calories: 830, mealCount: 2, countedMeals: 2, missingMeals: 0, partiallyCountedMeals: 0 });
});

test("旧記録の料理内訳から計算でき、未入力の食事は0 kcalと扱わない", () => {
  assert.deepEqual(summarizeDailyCalories([
    meal("old", day, undefined, [{ calories: 180 }, { calories: 95 }]),
    meal("unknown", day, undefined, [{ calories: 100 }, {}]),
  ], day), { calories: 275, mealCount: 2, countedMeals: 1, missingMeals: 1, partiallyCountedMeals: 0 });
});

test("食事記録がない日は合計0件、異常値は除外する", () => {
  assert.deepEqual(summarizeDailyCalories([], day), { calories: 0, mealCount: 0, countedMeals: 0, missingMeals: 0, partiallyCountedMeals: 0 });
  assert.deepEqual(summarizeDailyCalories([meal("bad", day, Number.NaN), meal("negative", day, -10)], day), { calories: 0, mealCount: 2, countedMeals: 0, missingMeals: 2, partiallyCountedMeals: 0 });
});

test("料理の一部だけカロリー入力済みなら概算ではなく入力済み分として扱う", () => {
  assert.deepEqual(summarizeDailyCalories([meal("partial", day, 210, [{ calories: 210 }, {}])], day), { calories: 210, mealCount: 1, countedMeals: 1, missingMeals: 0, partiallyCountedMeals: 1 });
});
