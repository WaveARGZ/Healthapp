import type { MealEntry } from "@/types/meal";

type MacroKey = "proteinG" | "fatG" | "carbsG";
const macroKeys: readonly MacroKey[] = ["proteinG", "fatG", "carbsG"];

function knownGrams(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Sum each meal once, using item values only for older entries without a meal total. */
export function summarizeDailyMacros(entries: readonly MealEntry[], day: string) {
  const meals = entries.filter((entry) => entry.recordedAt === day);
  const totals = { proteinG: 0, fatG: 0, carbsG: 0 };
  const knownCounts = { proteinG: 0, fatG: 0, carbsG: 0 };
  let incompleteMeals = 0;

  for (const meal of meals) {
    let incomplete = false;
    for (const key of macroKeys) {
      let value: number | undefined = knownGrams(meal[key]) ? meal[key] : undefined;
      if (value === undefined && meal.items?.length && meal.items.every((item) => knownGrams(item[key]))) {
        value = meal.items.reduce((sum, item) => sum + (item[key] ?? 0), 0);
      }
      if (value === undefined) {
        incomplete = true;
      } else {
        totals[key] += value;
        knownCounts[key] += 1;
        if (meal.items?.some((item) => !knownGrams(item[key]))) incomplete = true;
      }
    }
    if (incomplete) incompleteMeals += 1;
  }

  return { ...totals, knownCounts, mealCount: meals.length, incompleteMeals };
}
