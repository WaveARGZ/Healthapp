import assert from "node:assert/strict";
import test from "node:test";
import { mealEntryFromItems } from "../lib/utils/meal-entry.ts";
import { createMealMenuEntry, mealMenuItems } from "../lib/utils/meal-menu.ts";

const original = {
  id: "meal-original", name: "テスト食 ほか1品", mealType: "breakfast",
  recordedAt: "2026-11-23", recordedTime: "08:00", createdAt: "2026-11-23T00:00:00.000Z",
  items: [
    { id: "food-1", name: "テスト食（2個）", portionQuantity: 2, portionUnit: "個", calories: 120, proteinG: 6, fatG: 0 },
    { id: "food-2", name: "テスト飲料（250ml）", portionQuantity: 250, portionUnit: "ml", sourceBarcode: "12345678", barcodeSource: "manual", calories: 100 },
  ],
};

test("a saved menu can be recorded for a new meal with quantities, barcode and partial nutrition intact", async () => {
  const menu = await createMealMenuEntry(original);
  assert.equal(Object.hasOwn(menu, "recordedAt"), false);
  assert.equal(Object.hasOwn(menu.items[0], "id"), false);
  const repeated = mealEntryFromItems(menu.items.map((item, index) => ({ ...item, id: `repeat-${index}` })), {
    id: "meal-repeated", mealType: "lunch", recordedAt: "2026-11-25", recordedTime: "12:00", createdAt: "2026-11-25T03:00:00.000Z",
  });
  assert.equal(repeated.calories, 220);
  assert.equal(repeated.proteinG, undefined);
  assert.deepEqual(mealMenuItems(repeated), menu.items);
  assert.equal((await createMealMenuEntry(repeated)).id, menu.id);
});

test("older records without items remain reusable and changes to portions create a distinct menu", async () => {
  const menu = await createMealMenuEntry({ ...original, items: undefined, calories: 0 });
  assert.deepEqual(menu.items, [{ name: original.name, calories: 0, proteinG: undefined, fatG: undefined, carbsG: undefined }]);
  const changed = { ...original, items: [{ ...original.items[0], portionQuantity: 1 }, original.items[1]] };
  assert.notEqual((await createMealMenuEntry(changed)).id, (await createMealMenuEntry(original)).id);
});
