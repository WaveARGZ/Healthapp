export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const mealTypeLabels: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

export interface MealFoodItem {
  id: string;
  name: string;
  calories?: number;
  proteinG?: number;
  fatG?: number;
  carbsG?: number;
  /** The USDA FoodData Central row used for the initial nutrient values. */
  sourceFdcId?: number;
  /** The Japanese Standard Tables of Food Composition food number. */
  sourceFoodCode?: string;
  /** Barcode used to record a packaged product. */
  sourceBarcode?: string;
  barcodeSource?: "open-food-facts" | "manufacturer" | "manual";
  /** Weight used for the initial nutrient calculation; the user can edit it before adding. */
  portionGrams?: number;
  /** Entered serving, kept separate from the estimated edible weight. */
  portionUnit?: "g" | "ml" | "個" | "本";
  portionQuantity?: number;
  gramsPerPiece?: number;
}

export interface FoodPhotoPrediction {
  foodId: string;
  score: number;
}

/** A locally stored labelled sample for improving each user's future suggestions. */
export interface MealPhotoTrainingSample {
  id: string;
  predictedFoodIds: string[];
  confirmedFoodId: string;
  confirmedFoodName?: string;
  nutrition?: { calories: number; proteinG: number; fatG: number; carbsG: number };
  createdAt: string;
}

export interface MealEntry {
  id: string;
  mealType: MealType;
  name: string;
  calories?: number;
  proteinG?: number;
  fatG?: number;
  carbsG?: number;
  /** Foods that make up this meal. The scalar fields are the meal total. */
  items?: MealFoodItem[];
  /** Local calendar date (YYYY-MM-DD). */
  recordedAt: string;
  /** Local clock time (HH:mm). Optional for records saved before time tracking. */
  recordedTime?: string;
  createdAt: string;
}

export interface MealMenuEntry {
  id: string;
  name: string;
  items: Omit<MealFoodItem, "id">[];
  createdAt: string;
}
