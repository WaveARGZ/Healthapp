import type { BodyMakeClient } from "@/lib/api/bodymake-client";
import { readStorage, writeStorage } from "@/lib/storage/local-storage";
import type { MealEntry } from "@/types/meal";
import type { BodyPhotoEntry, WeightEntry } from "@/types/progress";
import type { UserProfile } from "@/types/user";
import type { WorkoutEntry } from "@/types/workout";

const keys = {
  profile: "bodymake.profile.v1",
  workouts: "bodymake.workouts.v1",
  meals: "bodymake.meals.v1",
  weights: "bodymake.weights.v1",
  photos: "bodymake.photos.v1",
} as const;

function sortByNewest<T extends { createdAt: string }>(entries: T[]): T[] {
  return [...entries].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );
}

function upsert<T extends { id: string }>(entries: T[], entry: T): T[] {
  const found = entries.findIndex((item) => item.id === entry.id);
  if (found === -1) return [entry, ...entries];
  return entries.map((item) => (item.id === entry.id ? entry : item));
}

export class LocalBodyMakeClient implements BodyMakeClient {
  async getProfile() {
    return readStorage<UserProfile | null>(keys.profile, null);
  }

  async saveProfile(profile: UserProfile) {
    writeStorage(keys.profile, profile);
    return profile;
  }

  async getWorkouts() {
    return sortByNewest(readStorage<WorkoutEntry[]>(keys.workouts, []));
  }

  async saveWorkout(entry: WorkoutEntry) {
    const entries = upsert(readStorage<WorkoutEntry[]>(keys.workouts, []), entry);
    writeStorage(keys.workouts, entries);
    return entry;
  }

  async deleteWorkout(id: string) {
    writeStorage(
      keys.workouts,
      readStorage<WorkoutEntry[]>(keys.workouts, []).filter((entry) => entry.id !== id),
    );
  }

  async getMeals() {
    return sortByNewest(readStorage<MealEntry[]>(keys.meals, []));
  }

  async saveMeal(entry: MealEntry) {
    const entries = upsert(readStorage<MealEntry[]>(keys.meals, []), entry);
    writeStorage(keys.meals, entries);
    return entry;
  }

  async deleteMeal(id: string) {
    writeStorage(
      keys.meals,
      readStorage<MealEntry[]>(keys.meals, []).filter((entry) => entry.id !== id),
    );
  }

  async getWeightEntries() {
    return sortByNewest(readStorage<WeightEntry[]>(keys.weights, []));
  }

  async saveWeightEntry(entry: WeightEntry) {
    const entries = upsert(readStorage<WeightEntry[]>(keys.weights, []), entry);
    writeStorage(keys.weights, entries);
    return entry;
  }

  async deleteWeightEntry(id: string) {
    writeStorage(
      keys.weights,
      readStorage<WeightEntry[]>(keys.weights, []).filter((entry) => entry.id !== id),
    );
  }

  async getBodyPhotos() {
    return sortByNewest(readStorage<BodyPhotoEntry[]>(keys.photos, []));
  }

  async saveBodyPhoto(entry: BodyPhotoEntry) {
    const entries = upsert(readStorage<BodyPhotoEntry[]>(keys.photos, []), entry);
    writeStorage(keys.photos, entries);
    return entry;
  }

  async deleteBodyPhoto(id: string) {
    writeStorage(
      keys.photos,
      readStorage<BodyPhotoEntry[]>(keys.photos, []).filter((entry) => entry.id !== id),
    );
  }
}
