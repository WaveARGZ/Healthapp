import type { MealEntry } from "../../types/meal.ts";
import type { WorkoutEntry } from "../../types/workout.ts";
import type { UserProfile, FitnessGoal } from "../../types/user.ts";
import type { WorkoutPreferences } from "../../types/workout-preferences.ts";
import type { RecommendationPreferences } from "../../types/recommendation-preferences.ts";

export type Nutrient = "calories" | "proteinG" | "fatG" | "carbsG";
export type Nutrition = Record<Nutrient, number>;
export type RecommendationConstraints = Omit<RecommendationPreferences, "version">;
export interface RecommendationCandidate {
  id: string;
  kind: "meal" | "workout";
  title: string;
  reason: string;
  nutrition?: Nutrition;
  /** Fixed, numeric ranking features; never a user-written string. */
  features: number[];
}
export interface RecommendationContext {
  version: "1";
  date: string;
  goal: FitnessGoal;
  nutrition: {
    mealCount: number;
    totals: Record<Nutrient, number | null>;
    complete: Record<Nutrient, boolean>;
  };
  recentWorkoutCount: number;
  constraints: RecommendationConstraints;
  candidates: RecommendationCandidate[];
  notices: string[];
}
export interface RecommendationInput {
  profile: UserProfile | null;
  meals: MealEntry[];
  workouts: WorkoutEntry[];
  preferences: WorkoutPreferences;
  date: string;
  constraints: RecommendationConstraints;
}
/** API transfer contract: no names, emails, dates, raw records or photos. */
export interface RecommendationRequest {
  version: "1";
  goal: FitnessGoal;
  nutrition: RecommendationContext["nutrition"];
  recentWorkoutCount: number;
  constraints: RecommendationConstraints;
  candidates: Array<Pick<RecommendationCandidate, "id" | "kind" | "features">>;
}
export interface RecommendationRanking {
  mealIds: string[];
  workoutIds: string[];
}
export interface RecommendationResult extends RecommendationRanking {
  source: "rules" | "openai" | "local-model";
  model: string;
  requestId?: string;
}
