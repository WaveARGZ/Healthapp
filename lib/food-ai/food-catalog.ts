import libraryJson from "@/lib/data/food-library.json";
import { foodToMealItem, type FoodLibraryDataset } from "@/types/food-database";
import type { MealFoodItem } from "@/types/meal";

export interface FoodCatalogItem {
  id: string;
  clipLabel: string;
  food: Omit<MealFoodItem, "id">;
}

const library = libraryJson as FoodLibraryDataset;
const photoLabels: Array<[string, string]> = [
  ["rice", "a bowl of white rice"],
  ["brown-rice", "a bowl of brown rice"],
  ["miso-soup", "a bowl of miso soup"],
  ["natto", "Japanese natto fermented soybeans"],
  ["grilled-salmon", "grilled salmon"],
  ["chicken-breast", "grilled chicken breast"],
  ["curry-rice", "beef curry with rice"],
  ["beef-bowl", "beef and rice with soy sauce"],
  ["rice-fried-vegetable", "vegetable fried rice"],
  ["ramen", "a bowl of ramen noodles"],
  ["soba", "cooked soba noodles"],
  ["pasta", "pasta with tomato sauce"],
  ["sushi", "sushi"],
  ["tofu", "tofu"],
  ["salad", "green salad"],
  ["fried-egg", "fried egg"],
  ["omelette", "omelette"],
  ["bread", "white bread toast"],
  ["banana", "banana"],
  ["yogurt", "plain Greek yogurt"],
  ["protein-shake", "fruit and protein smoothie"],
  ["hamburger-steak", "grilled beef patty"],
  ["pizza", "cheese pizza"],
  ["hamburger", "hamburger"],
  ["chicken-nuggets", "chicken nuggets"],
  ["potato-fries", "French fries"],
  ["shrimp-grilled", "grilled shrimp"],
];

/** The same sourced nutrition values are used by search and photo suggestions. */
export const foodCatalog: FoodCatalogItem[] = photoLabels.map(([id, clipLabel]) => {
  const source = library.foods.find((item) => item.id === id);
  if (!source) throw new Error(`Missing food library item: ${id}`);
  return { id, clipLabel, food: foodToMealItem(source, source.suggestedGrams) };
});

export function findFoodById(id: string): FoodCatalogItem | undefined {
  return foodCatalog.find((item) => item.id === id);
}
