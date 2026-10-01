import type { MealFoodItem } from "@/types/meal";

export interface FoodCatalogItem {
  id: string;
  clipLabel: string;
  food: Omit<MealFoodItem, "id">;
}

/**
 * Starter candidates and approximate nutrients for one common serving.
 * These are deliberately editable after prediction; a future MEXT-backed
 * nutrition catalogue can replace this lightweight local seed data.
 */
export const foodCatalog: FoodCatalogItem[] = [
  { id: "rice", clipLabel: "a bowl of white rice", food: { name: "ご飯（白ごはん 150g）", calories: 234, proteinG: 3.8, fatG: 0.5, carbsG: 55.7 } },
  { id: "miso-soup", clipLabel: "a bowl of miso soup", food: { name: "味噌汁（1杯）", calories: 40, proteinG: 2.5, fatG: 1.5, carbsG: 4.2 } },
  { id: "grilled-salmon", clipLabel: "grilled salmon", food: { name: "焼き鮭（1切れ）", calories: 160, proteinG: 22, fatG: 8, carbsG: 0.1 } },
  { id: "chicken-breast", clipLabel: "grilled chicken breast", food: { name: "鶏むね肉のグリル（150g）", calories: 165, proteinG: 34, fatG: 2.9, carbsG: 0 } },
  { id: "curry-rice", clipLabel: "Japanese curry rice", food: { name: "カレーライス（1皿）", calories: 750, proteinG: 20, fatG: 25, carbsG: 110 } },
  { id: "beef-bowl", clipLabel: "Japanese beef bowl", food: { name: "牛丼（並盛）", calories: 733, proteinG: 21, fatG: 25, carbsG: 105 } },
  { id: "ramen", clipLabel: "ramen noodles", food: { name: "ラーメン（1杯）", calories: 450, proteinG: 18, fatG: 16, carbsG: 58 } },
  { id: "pasta", clipLabel: "pasta", food: { name: "パスタ（1皿）", calories: 620, proteinG: 20, fatG: 21, carbsG: 88 } },
  { id: "sushi", clipLabel: "sushi", food: { name: "寿司（10貫）", calories: 600, proteinG: 30, fatG: 10, carbsG: 95 } },
  { id: "tofu", clipLabel: "tofu", food: { name: "冷奴（150g）", calories: 108, proteinG: 10, fatG: 6.3, carbsG: 3 } },
  { id: "salad", clipLabel: "green salad", food: { name: "サラダ（ドレッシングなし）", calories: 45, proteinG: 2, fatG: 0.5, carbsG: 8 } },
  { id: "fried-egg", clipLabel: "fried egg", food: { name: "目玉焼き（1個）", calories: 91, proteinG: 6.3, fatG: 7, carbsG: 0.2 } },
  { id: "omelette", clipLabel: "omelette", food: { name: "オムレツ（1人前）", calories: 230, proteinG: 14, fatG: 17, carbsG: 4 } },
  { id: "bread", clipLabel: "toast bread", food: { name: "食パン（6枚切り 1枚）", calories: 149, proteinG: 5.6, fatG: 2.5, carbsG: 28 } },
  { id: "banana", clipLabel: "banana", food: { name: "バナナ（1本）", calories: 93, proteinG: 1.1, fatG: 0.2, carbsG: 22.5 } },
  { id: "yogurt", clipLabel: "Greek yogurt", food: { name: "ギリシャヨーグルト（100g）", calories: 97, proteinG: 10, fatG: 0.4, carbsG: 12 } },
  { id: "protein-shake", clipLabel: "protein shake", food: { name: "プロテインドリンク（1杯）", calories: 120, proteinG: 20, fatG: 2, carbsG: 6 } },
  { id: "hamburger-steak", clipLabel: "hamburger steak", food: { name: "ハンバーグ（1個）", calories: 270, proteinG: 17, fatG: 18, carbsG: 11 } },
  { id: "pizza", clipLabel: "pizza", food: { name: "ピザ（2切れ）", calories: 430, proteinG: 19, fatG: 16, carbsG: 53 } },
];

export function findFoodById(id: string): FoodCatalogItem | undefined {
  return foodCatalog.find((item) => item.id === id);
}
