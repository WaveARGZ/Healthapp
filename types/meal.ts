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
  recordedAt: string;
  createdAt: string;
}
