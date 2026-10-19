import { deleteDoc, doc, getDoc, getDocs, collection, setDoc } from "firebase/firestore";
import type { BodyMakeClient } from "@/lib/api/bodymake-client";
import { currentFirebaseUser } from "@/lib/auth/firebase-session";
import { firebaseDb } from "@/lib/firebase/app";
import { deleteDeviceBodyPhoto, getDeviceBodyPhotos, saveDeviceBodyPhoto } from "@/lib/storage/device-body-photos";
import type { MealEntry } from "@/types/meal";
import type { BodyPhotoEntry, WeightEntry } from "@/types/progress";
import type { UserProfile } from "@/types/user";
import type { WorkoutEntry } from "@/types/workout";

const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

async function userPath(...parts: string[]) {
  const user = await currentFirebaseUser();
  return { user, path: ["users", user.uid, ...parts].join("/") };
}

async function list<T extends { createdAt: string }>(kind: string): Promise<T[]> {
  const { path } = await userPath(kind);
  const snapshot = await getDocs(collection(firebaseDb(), path));
  return snapshot.docs.map((item) => item.data() as T).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function put<T extends { id: string }>(kind: string, entry: T): Promise<T> {
  const { path } = await userPath(kind, entry.id);
  await setDoc(doc(firebaseDb(), path), clean(entry));
  return entry;
}

async function remove(kind: string, id: string) {
  const { path } = await userPath(kind, id);
  await deleteDoc(doc(firebaseDb(), path));
}

export class FirebaseBodyMakeClient implements BodyMakeClient {
  async getProfile() {
    const { path } = await userPath("profile", "main");
    const snapshot = await getDoc(doc(firebaseDb(), path));
    return snapshot.exists() ? snapshot.data() as UserProfile : null;
  }
  async saveProfile(profile: UserProfile) {
    const { user, path } = await userPath("profile", "main");
    const value = clean({ ...profile, id: user.uid, email: user.email ?? profile.email });
    await setDoc(doc(firebaseDb(), path), value);
    return value;
  }
  getWorkouts() { return list<WorkoutEntry>("workouts"); }
  saveWorkout(entry: WorkoutEntry) { return put("workouts", entry); }
  deleteWorkout(id: string) { return remove("workouts", id); }
  getMeals() { return list<MealEntry>("meals"); }
  saveMeal(entry: MealEntry) { return put("meals", entry); }
  deleteMeal(id: string) { return remove("meals", id); }
  getWeightEntries() { return list<WeightEntry>("weights"); }
  saveWeightEntry(entry: WeightEntry) { return put("weights", entry); }
  deleteWeightEntry(id: string) { return remove("weights", id); }
  async getBodyPhotos() { return getDeviceBodyPhotos((await currentFirebaseUser()).uid); }
  async saveBodyPhoto(entry: BodyPhotoEntry) { return saveDeviceBodyPhoto((await currentFirebaseUser()).uid, entry); }
  async deleteBodyPhoto(id: string) { return deleteDeviceBodyPhoto((await currentFirebaseUser()).uid, id); }
}
