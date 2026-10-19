import type { MealFoodItem } from "@/types/meal";

/** Only photo-estimated calories err slightly high; PFC and serving weight stay unchanged. */
export const PHOTO_NUTRITION_UPLIFT = 0.1;

function ceilTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.ceil(value * (1 + PHOTO_NUTRITION_UPLIFT) * scale - 1e-9) / scale;
}

export function applyPhotoNutritionUplift(food: Omit<MealFoodItem, "id">): Omit<MealFoodItem, "id"> {
  return {
    ...food,
    calories: food.calories === undefined ? undefined : ceilTo(food.calories, 0),
  };
}
