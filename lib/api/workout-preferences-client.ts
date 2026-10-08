import { cloudRequest } from "@/lib/api/aws-bodymake-client";
import { isCloudConfigured } from "@/lib/cloud/config";
import { getWorkoutPreferences, saveWorkoutPreferences } from "@/lib/storage/workout-preferences";
import { defaultWorkoutPreferences, type WorkoutPreferences } from "@/types/workout-preferences";

export async function loadWorkoutPreferences(): Promise<WorkoutPreferences> {
  if (!isCloudConfigured) return getWorkoutPreferences();
  return await cloudRequest<WorkoutPreferences | null>("/records/preferences") ?? defaultWorkoutPreferences;
}

export async function storeWorkoutPreferences(preferences: WorkoutPreferences): Promise<void> {
  if (!isCloudConfigured) { saveWorkoutPreferences(preferences); return; }
  await cloudRequest("/records/preferences/main", { method: "PUT", body: JSON.stringify(preferences) });
}
