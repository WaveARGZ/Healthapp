import { readStorage, writeStorage } from "@/lib/storage/local-storage";
import { normalizeWorkoutPreferences, type WorkoutPreferences } from "@/types/workout-preferences";

const key = "bodymake.workout-preferences.v1";

export function getWorkoutPreferences(): WorkoutPreferences {
  return normalizeWorkoutPreferences(readStorage<unknown>(key, {}));
}

export function saveWorkoutPreferences(preferences: WorkoutPreferences): void {
  writeStorage(key, preferences);
}
