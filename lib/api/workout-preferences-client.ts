import { cloudRequest } from "@/lib/api/aws-bodymake-client";
import { isCloudConfigured } from "@/lib/cloud/config";
import { getWorkoutPreferences, saveWorkoutPreferences } from "@/lib/storage/workout-preferences";
import { normalizeWorkoutPreferences, type WorkoutPreferences } from "@/types/workout-preferences";
import { isFirebaseSelected } from "@/lib/firebase/config";
import { currentFirebaseUser } from "@/lib/auth/firebase-session";
import { firebaseDb } from "@/lib/firebase/app";
import { doc, getDoc, setDoc } from "firebase/firestore";

async function firebasePreferencesPath() {
  return doc(firebaseDb(), "users", (await currentFirebaseUser()).uid, "settings", "workout-preferences");
}

export async function loadWorkoutPreferences(): Promise<WorkoutPreferences> {
  if (isFirebaseSelected) {
    const snapshot = await getDoc(await firebasePreferencesPath());
    return normalizeWorkoutPreferences(snapshot.exists() ? snapshot.data() : null);
  }
  if (!isCloudConfigured) return getWorkoutPreferences();
  return normalizeWorkoutPreferences(await cloudRequest<WorkoutPreferences | null>("/records/preferences"));
}

export async function storeWorkoutPreferences(preferences: WorkoutPreferences): Promise<void> {
  if (isFirebaseSelected) { await setDoc(await firebasePreferencesPath(), preferences); return; }
  if (!isCloudConfigured) { saveWorkoutPreferences(preferences); return; }
  await cloudRequest("/records/preferences/main", { method: "PUT", body: JSON.stringify(preferences) });
}
