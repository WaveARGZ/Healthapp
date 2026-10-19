export type FoodPortionUnit = "g" | "個" | "本";

/** Approximate edible weight for foods commonly counted by piece. Users can correct it. */
export function suggestedGramsPerPiece(id: string, name: string, suggestedGrams: number): number | null {
  const normalized = name.normalize("NFKC");
  if (id === "schau-essen") return 20;
  if (id === "boiled-egg" || id === "fried-egg" || /^(?:鶏卵|うずら卵|ゆで卵|茹で卵|生卵|目玉焼き|たまご(?:$|[ （]))/.test(normalized)) {
    if (/うずら/.test(normalized)) return 10;
    return id === "boiled-egg" || id === "fried-egg" ? suggestedGrams : 50;
  }
  if (id === "banana" || /バナナ/.test(normalized)) return id === "banana" ? suggestedGrams : 100;
  if (id === "apple" || /りんご|リンゴ/.test(normalized)) return id === "apple" ? suggestedGrams : 150;
  return null;
}

export function portionGrams(quantity: number, unit: FoodPortionUnit, gramsPerPiece: number): number {
  return unit === "g" ? quantity : Math.round(quantity * gramsPerPiece * 10) / 10;
}

export function validPortion(quantity: number, unit: FoodPortionUnit, gramsPerPiece: number): boolean {
  return Number.isFinite(quantity) && quantity > 0 && (unit === "g" || Number.isInteger(quantity))
    && (unit === "g" || (Number.isFinite(gramsPerPiece) && gramsPerPiece > 0))
    && portionGrams(quantity, unit, gramsPerPiece) <= 3000;
}

export function scaleNutrition<T extends { calories?: number; proteinG?: number; fatG?: number; carbsG?: number }>(food: T, factor: number): T {
  const roundOne = (value: number) => Math.round(value * factor * 10) / 10;
  return {
    ...food,
    calories: food.calories === undefined ? undefined : Math.round(food.calories * factor),
    proteinG: food.proteinG === undefined ? undefined : roundOne(food.proteinG),
    fatG: food.fatG === undefined ? undefined : roundOne(food.fatG),
    carbsG: food.carbsG === undefined ? undefined : roundOne(food.carbsG),
  };
}
