export type Gender = "male" | "female" | "other" | "prefer-not-to-say";

export type FitnessGoal = "build-muscle" | "lose-fat" | "maintain";

export const fitnessGoalLabels: Record<FitnessGoal, string> = {
  "build-muscle": "筋肉を増やす",
  "lose-fat": "体脂肪を減らす",
  maintain: "現在の体型を維持する",
};

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  age?: number;
  gender?: Gender;
  heightCm?: number;
  startingWeightKg?: number;
  goal: FitnessGoal;
  updatedAt: string;
}
