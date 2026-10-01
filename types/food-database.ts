import type { MealFoodItem } from "@/types/meal";

export interface OfficialFood {
  code: string;
  group: string;
  name: string;
  calories: number;
  proteinG?: number;
  fatG?: number;
  carbsG?: number;
}

export interface OfficialFoodDataset {
  version: string;
  sourceName: string;
  sourceUrl: string;
  sourceDataUrl: string;
  basis: string;
  foods: OfficialFood[];
}

export function officialFoodToMealItem(food: OfficialFood): Omit<MealFoodItem, "id"> {
  return {
    name: `${food.name}（可食部100g）`,
    calories: food.calories,
    proteinG: food.proteinG,
    fatG: food.fatG,
    carbsG: food.carbsG,
  };
}
