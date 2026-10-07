import libraryJson from "@/lib/data/food-library.json";
import photoLabelsJson from "@/lib/food-ai/photo-labels.json";
import { foodToMealItem, type FoodLibraryDataset } from "@/types/food-database";
import type { MealFoodItem } from "@/types/meal";

export interface FoodCatalogItem {
  id: string;
  clipLabel: string;
  food: Omit<MealFoodItem, "id">;
}

const library = libraryJson as FoodLibraryDataset;
const photoLabels = photoLabelsJson as Array<[string, string]>;

/** The same sourced nutrition values are used by search and photo suggestions. */
export const foodCatalog: FoodCatalogItem[] = photoLabels.map(([id, clipLabel]) => {
  const source = library.foods.find((item) => item.id === id);
  if (!source) throw new Error(`Missing food library item: ${id}`);
  return { id, clipLabel, food: foodToMealItem(source, source.suggestedGrams) };
});

export function findFoodById(id: string): FoodCatalogItem | undefined {
  return foodCatalog.find((item) => item.id === id);
}
