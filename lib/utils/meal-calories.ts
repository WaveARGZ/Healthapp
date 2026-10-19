import type { MealEntry } from "@/types/meal";

function knownCalories(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Sum each meal once. Older records can use their item values when no meal total exists. */
export function summarizeDailyCalories(entries: readonly MealEntry[], day: string) {
  const meals = entries.filter((entry) => entry.recordedAt === day);
  let calories = 0;
  let countedMeals = 0;
  let partiallyCountedMeals = 0;

  for (const meal of meals) {
    let value: number | undefined = knownCalories(meal.calories) ? meal.calories : undefined;
    if (value === undefined && meal.items?.length && meal.items.every((item) => knownCalories(item.calories))) {
      value = meal.items.reduce((sum, item) => sum + (item.calories ?? 0), 0);
    }
    if (value !== undefined) {
      calories += value;
      countedMeals += 1;
      if (meal.items?.some((item) => !knownCalories(item.calories))) partiallyCountedMeals += 1;
    }
  }

  return { calories, mealCount: meals.length, countedMeals, missingMeals: meals.length - countedMeals, partiallyCountedMeals };
}
