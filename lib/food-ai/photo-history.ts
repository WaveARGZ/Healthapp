import type { MealEntry, MealFoodItem } from "@/types/meal";
import type { FoodCatalogItem } from "@/lib/food-ai/food-catalog";

export const MAX_PHOTO_HISTORY_CANDIDATES = 20;

/** Strip only the serving suffix written by the meal form; retain recipe variants. */
export function photoDishName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\(\d+(?:\.\d+)?(?:g|個|本)(?:・約?\d+(?:\.\d+)?g)?\)$/, "").trim();
}

function key(name: string): string {
  return name.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "");
}

// CLIP's text prompts are English. These names describe the user's own dish;
// they do not map an unknown dish into the existing evaluated model classes.
const prompts: Record<string, string> = {
  "焼きそば": "yakisoba, Japanese stir-fried noodles",
  "焼そば": "yakisoba, Japanese stir-fried noodles",
  "ソース焼きそば": "yakisoba noodles with Japanese sauce",
  "塩焼きそば": "salt-seasoned yakisoba stir-fried noodles",
  "オムライス": "omurice, Japanese omelette over fried rice",
  "たこ焼き": "takoyaki octopus balls",
  "お好み焼き": "okonomiyaki, Japanese savory pancake",
  "うどん": "Japanese udon noodles",
  "餃子": "gyoza, Japanese pan-fried dumplings",
  "とんかつ": "tonkatsu, Japanese breaded pork cutlet",
};

function nutrition(food: Partial<MealFoodItem>): Partial<MealFoodItem> {
  const values: Partial<MealFoodItem> = {};
  for (const field of ["calories", "proteinG", "fatG", "carbsG"] as const) {
    const value = food[field];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10000) values[field] = value;
  }
  if (typeof food.portionGrams === "number" && Number.isFinite(food.portionGrams) && food.portionGrams > 0 && food.portionGrams <= 3000) {
    values.portionGrams = food.portionGrams;
  }
  return values;
}

/** Uses only the signed-in user's already-loaded meal records, without storage or uploads. */
export function buildPhotoHistory(meals: readonly MealEntry[], catalog: readonly FoodCatalogItem[]): FoodCatalogItem[] {
  const existing = new Set(catalog.map((item) => key(photoDishName(item.food.name))));
  const seen = new Set<string>();
  const comparedPrompts = new Set(catalog.map((food) => food.clipLabel));
  const result: FoodCatalogItem[] = [];
  const newestFirst = [...meals].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  for (const meal of newestFirst) {
    // A multi-dish meal's total is not one dish's nutrition.
    const foods = meal.items?.length ? meal.items : [meal];
    for (const food of foods) {
      if (typeof food.name !== "string") continue;
      const name = photoDishName(food.name);
      const normalized = key(name);
      if (!normalized || name.length > 100 || existing.has(normalized) || seen.has(normalized)) continue;
      const clipLabel = Object.hasOwn(prompts, normalized) ? prompts[normalized] : `Japanese food called ${name}`;
      if (comparedPrompts.has(clipLabel)) continue;
      seen.add(normalized);
      comparedPrompts.add(clipLabel);
      result.push({ id: `history:${encodeURIComponent(normalized)}`, clipLabel,
        origin: "history", food: { name, ...nutrition(food) } });
      if (result.length === MAX_PHOTO_HISTORY_CANDIDATES) return result;
    }
  }
  return result;
}
