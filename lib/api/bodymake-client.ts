import type { MealEntry } from "@/types/meal";
import type { BodyPhotoEntry, WeightEntry } from "@/types/progress";
import type { UserProfile } from "@/types/user";
import type { WorkoutEntry } from "@/types/workout";

/**
 * Persistence contract for BodyMake. The UI only depends on this shape, so a
 * Cognito/API Gateway implementation can replace the local implementation.
 */
export interface BodyMakeClient {
  getProfile(): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<UserProfile>;
  getWorkouts(): Promise<WorkoutEntry[]>;
  saveWorkout(entry: WorkoutEntry): Promise<WorkoutEntry>;
  deleteWorkout(id: string): Promise<void>;
  getMeals(): Promise<MealEntry[]>;
  saveMeal(entry: MealEntry): Promise<MealEntry>;
  deleteMeal(id: string): Promise<void>;
  getWeightEntries(): Promise<WeightEntry[]>;
  saveWeightEntry(entry: WeightEntry): Promise<WeightEntry>;
  deleteWeightEntry(id: string): Promise<void>;
  getBodyPhotos(): Promise<BodyPhotoEntry[]>;
  saveBodyPhoto(entry: BodyPhotoEntry): Promise<BodyPhotoEntry>;
  deleteBodyPhoto(id: string): Promise<void>;
}
