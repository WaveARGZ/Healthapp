import type { MealFoodItem } from "@/types/meal";

/** Photo estimates intentionally err high so uncertain serving sizes are less likely to be undercounted. */
export const PHOTO_NUTRITION_UPLIFT = 0.2;

function ceilTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.ceil(value * (1 + PHOTO_NUTRITION_UPLIFT) * scale) / scale;
}

export function applyPhotoNutritionUplift(food: Omit<MealFoodItem, "id">): Omit<MealFoodItem, "id"> {
  return {
    ...food,
    calories: food.calories === undefined ? undefined : ceilTo(food.calories, 0),
    proteinG: food.proteinG === undefined ? undefined : ceilTo(food.proteinG, 1),
    fatG: food.fatG === undefined ? undefined : ceilTo(food.fatG, 1),
    carbsG: food.carbsG === undefined ? undefined : ceilTo(food.carbsG, 1),
    portionGrams: food.portionGrams === undefined ? undefined : ceilTo(food.portionGrams, 0),
  };
}
