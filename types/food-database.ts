import type { MealFoodItem } from "@/types/meal";

export interface FoodLibraryItem {
  id: string;
  name: string;
  category: string;
  aliases: string;
  suggestedGrams: number;
  sourceDataset: string;
  sourceUrl?: string;
  fdcId?: number;
  foodCode?: string;
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

export function foodToMealItem(food: FoodLibraryItem, grams: number, portion?: { unit: "g" | "個" | "本"; quantity: number; gramsPerPiece?: number }): Omit<MealFoodItem, "id"> {
  const factor = grams / 100;
  const roundOne = (value: number) => Math.round(value * factor * 10) / 10;
  return {
    name: `${food.name}（${portion?.unit && portion.unit !== "g" ? `${portion.quantity}${portion.unit}・約${grams}g` : `${grams}g`}）`,
    calories: Math.round(food.per100g.calories * factor),
    proteinG: roundOne(food.per100g.proteinG),
    fatG: roundOne(food.per100g.fatG),
    carbsG: roundOne(food.per100g.carbsG),
    ...(food.fdcId ? { sourceFdcId: food.fdcId } : {}),
    ...(food.foodCode ? { sourceFoodCode: food.foodCode } : {}),
    portionGrams: grams,
    portionUnit: portion?.unit ?? "g",
    portionQuantity: portion?.quantity ?? grams,
    ...(portion?.unit && portion.unit !== "g" && portion.gramsPerPiece ? { gramsPerPiece: portion.gramsPerPiece } : {}),
  };
}
