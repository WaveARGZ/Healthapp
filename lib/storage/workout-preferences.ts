import { readStorage, writeStorage } from "@/lib/storage/local-storage";
import { defaultWorkoutPreferences, type WorkoutPreferences } from "@/types/workout-preferences";

const key = "bodymake.workout-preferences.v1";

export function getWorkoutPreferences(): WorkoutPreferences {
  const stored = readStorage<Partial<WorkoutPreferences>>(key, {});
  return {
    facilityEquipment: Array.isArray(stored.facilityEquipment) ? stored.facilityEquipment.filter((item): item is string => typeof item === "string") : [],
    customEquipment: Array.isArray(stored.customEquipment) ? stored.customEquipment.filter((item): item is string => typeof item === "string") : [],
    favoriteExercises: Array.isArray(stored.favoriteExercises) ? stored.favoriteExercises.filter((item): item is string => typeof item === "string") : [...defaultWorkoutPreferences.favoriteExercises],
  };
}

export function saveWorkoutPreferences(preferences: WorkoutPreferences): void {
  writeStorage(key, preferences);
}
