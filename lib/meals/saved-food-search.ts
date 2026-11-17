import { normalizeFoodSearch } from "../food-catalog-groups.mjs";
import type { MealEntry, MealFoodItem } from "../../types/meal";

export interface SavedFoodSuggestion {
  id: string;
  food: MealFoodItem;
}

/** Reuse only the signed-in user's saved meal records, without creating a shared catalog. */
export function searchSavedMealFoods(meals: MealEntry[], query: string, limit = 5): SavedFoodSuggestion[] {
  const tokens = query.trim().split(/\s+/).map(normalizeFoodSearch).filter(Boolean);
  if (!tokens.length || limit <= 0) return [];

  const matches = meals.flatMap((meal) => {
    const foods = meal.items?.length ? meal.items : [{
      id: meal.id,
      name: meal.name,
      calories: meal.calories,
      proteinG: meal.proteinG,
      fatG: meal.fatG,
      carbsG: meal.carbsG,
    }];
    return foods.map((food) => ({ id: `${meal.id}:${food.id}`, food, createdAt: meal.createdAt }));
  }).filter(({ food }) => food.name.trim() && tokens.every((token) => normalizeFoodSearch(food.name).includes(token)));

  matches.sort((left, right) => {
    const leftName = normalizeFoodSearch(left.food.name);
    const rightName = normalizeFoodSearch(right.food.name);
    const term = tokens.join("");
    const rank = (name: string) => name === term ? 0 : name.startsWith(term) ? 1 : 2;
    return rank(leftName) - rank(rightName) || right.createdAt.localeCompare(left.createdAt);
  });

  const seen = new Set<string>();
  const suggestions: SavedFoodSuggestion[] = [];
  for (const { id, food } of matches) {
    const key = JSON.stringify([normalizeFoodSearch(food.name), food.calories, food.proteinG, food.fatG, food.carbsG, food.portionQuantity, food.portionUnit, food.portionGrams]);
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ id, food });
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}
