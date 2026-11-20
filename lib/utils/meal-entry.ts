import type { MealEntry, MealFoodItem } from "@/types/meal";

type MealMeta = Pick<MealEntry, "id" | "mealType" | "recordedAt" | "recordedTime" | "createdAt">;
type NutritionKey = "calories" | "proteinG" | "fatG" | "carbsG";

/** Keep each selected food in one meal document and store totals for the daily summaries. */
export function mealEntryFromItems(items: readonly MealFoodItem[], meta: MealMeta): MealEntry {
  if (!items.length) throw new Error("食品が選択されていません。");
  const total = (key: NutritionKey): number | undefined => {
    if (!items.every((item) => typeof item[key] === "number" && Number.isFinite(item[key]) && (item[key] ?? 0) >= 0)) return undefined;
    if (items.length === 1) return items[0][key];
    return Math.round(items.reduce((sum, item) => sum + (item[key] ?? 0), 0) * 10) / 10;
  };
  return {
    ...meta,
    name: items.length === 1 ? items[0].name.trim() : `${items[0].name.trim()} ほか${items.length - 1}品`,
    items: [...items],
    calories: total("calories"),
    proteinG: total("proteinG"),
    fatG: total("fatG"),
    carbsG: total("carbsG"),
  };
}
