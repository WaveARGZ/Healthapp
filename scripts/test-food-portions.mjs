import assert from "node:assert/strict";
import test from "node:test";
import { portionGrams, scaleNutrition, suggestedGramsPerPiece, validPortion } from "../lib/food-portions.ts";
import { applyPhotoNutritionUplift } from "../lib/food-ai/photo-nutrition-estimate.ts";
import { foodToMealItem } from "../types/food-database.ts";
import { readFileSync } from "node:fs";

test("eggs can be recorded as two pieces with unchanged PFC", () => {
  const food = { id: "boiled-egg", name: "ゆで卵", category: "卵", aliases: "", suggestedGrams: 55, sourceDataset: "test", per100g: { calories: 150, proteinG: 12, fatG: 10, carbsG: 1 } };
  const gramsPerPiece = suggestedGramsPerPiece(food.id, food.name, food.suggestedGrams);
  assert.equal(gramsPerPiece, 55);
  const grams = portionGrams(2, "個", gramsPerPiece);
  const result = foodToMealItem(food, grams, { unit: "個", quantity: 2, gramsPerPiece });
  assert.equal(result.name, "ゆで卵（2個・約110g）");
  assert.equal(result.calories, 165);
  assert.equal(result.proteinG, 13.2);
  assert.equal(result.portionGrams, 110);
  assert.equal(result.portionQuantity, 2);
});

test("photo uplift changes calories only", () => {
  const original = { name: "卵", calories: 100, proteinG: 7.4, fatG: 5.6, carbsG: 0.4, portionGrams: 50 };
  const result = applyPhotoNutritionUplift(original);
  assert.equal(result.calories, 110);
  assert.equal(result.proteinG, original.proteinG);
  assert.equal(result.fatG, original.fatG);
  assert.equal(result.carbsG, original.carbsG);
  assert.equal(result.portionGrams, original.portionGrams);
});

test("Schau Essen can be recorded by stick using official per-100g nutrition", () => {
  const food = JSON.parse(readFileSync("lib/data/food-library.json", "utf8")).foods.find((item) => item.id === "schau-essen");
  assert.ok(food);
  assert.equal(suggestedGramsPerPiece(food.id, food.name, food.suggestedGrams), 20);
  assert.equal(foodToMealItem(food, 20, { unit: "本", quantity: 1, gramsPerPiece: 20 }).calories, 65);
  const result = foodToMealItem(food, portionGrams(2, "本", 20), { unit: "本", quantity: 2, gramsPerPiece: 20 });
  assert.equal(result.name, "シャウエッセン（2本・約40g）");
  assert.equal(result.calories, 130);
  assert.equal(result.proteinG, 5);
  assert.equal(result.fatG, 11.7);
  assert.equal(result.carbsG, 1.2);
  assert.equal(result.portionUnit, "本");
  assert.equal(validPortion(1.5, "本", 20), false);
});

test("serving changes scale nutrition and reject invalid amounts", () => {
  assert.deepEqual(scaleNutrition({ calories: 80, proteinG: 4, fatG: 2, carbsG: 1 }, 2), { calories: 160, proteinG: 8, fatG: 4, carbsG: 2 });
  assert.equal(validPortion(2, "個", 50), true);
  assert.equal(validPortion(1.5, "個", 50), false);
  assert.equal(validPortion(2, "個", 0), false);
  assert.equal(validPortion(31, "個", 100), false);
});
