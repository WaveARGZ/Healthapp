import type { MealEntry, MealFoodItem, MealMenuEntry } from "@/types/meal";

export function mealMenuItems(entry: MealEntry): MealMenuEntry["items"] {
  if (!entry.items?.length) {
    const { name, calories, proteinG, fatG, carbsG } = entry;
    return [{ name, calories, proteinG, fatG, carbsG }];
  }
  return entry.items.map((item) => {
    const { name, calories, proteinG, fatG, carbsG, sourceBarcode, barcodeSource,
      sourceFdcId, sourceFoodCode, portionGrams, portionUnit, portionQuantity, gramsPerPiece } = item;
    return { name, calories, proteinG, fatG, carbsG, sourceBarcode, barcodeSource,
      sourceFdcId, sourceFoodCode, portionGrams, portionUnit, portionQuantity, gramsPerPiece };
  });
}

export function mealMenuKey(items: readonly Omit<MealFoodItem, "id">[]): string {
  return JSON.stringify(items.map(({ name, calories, proteinG, fatG, carbsG, sourceBarcode, portionQuantity, portionUnit, portionGrams, gramsPerPiece }) =>
    [name.trim(), calories, proteinG, fatG, carbsG, sourceBarcode, portionQuantity, portionUnit, portionGrams, gramsPerPiece]));
}

export async function createMealMenuEntry(entry: MealEntry): Promise<MealMenuEntry> {
  const items = mealMenuItems(entry);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(mealMenuKey(items)));
  const id = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { id, name: entry.name.trim(), items, createdAt: new Date().toISOString() };
}
