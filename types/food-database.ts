import type { MealFoodItem } from "@/types/meal";

export interface FoodLibraryItem {
  id: string;
  name: string;
  category: string;
  aliases: string;
  suggestedGrams: number;
  sourceDataset: string;
  fdcId: number;
  sourceDescription?: string;
  per100g: {
    calories: number;
    proteinG: number;
    fatG: number;
    carbsG: number;
  };
}

export interface FoodLibraryDataset {
  version: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  basis: string;
  foods: FoodLibraryItem[];
}

export function foodToMealItem(food: FoodLibraryItem, grams: number): Omit<MealFoodItem, "id"> {
  const factor = grams / 100;
  const roundOne = (value: number) => Math.round(value * factor * 10) / 10;
  return {
    name: `${food.name}（${grams}g）`,
    calories: Math.round(food.per100g.calories * factor),
    proteinG: roundOne(food.per100g.proteinG),
    fatG: roundOne(food.per100g.fatG),
    carbsG: roundOne(food.per100g.carbsG),
    sourceFdcId: food.fdcId,
    portionGrams: grams,
  };
}
