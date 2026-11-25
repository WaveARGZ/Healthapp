import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { getCloudSubject } from "@/lib/auth/cognito-session";
import { currentFirebaseUser } from "@/lib/auth/firebase-session";
import { isCloudConfigured } from "@/lib/cloud/config";
import { firebaseDb } from "@/lib/firebase/app";
import { isFirebaseSelected } from "@/lib/firebase/config";
import { readStorage, writeStorage } from "@/lib/storage/local-storage";
import type { MealMenuEntry } from "@/types/meal";

async function userMenuCollection() {
  return collection(firebaseDb(), "users", (await currentFirebaseUser()).uid, "mealMenu");
}

function deviceMenuKey() {
  const subject = isCloudConfigured ? getCloudSubject() : "demo";
  if (!subject) throw new Error("ログインが必要です。");
  return `bodymake.meal-menu.v1.${subject}`;
}

export async function loadMealMenu(): Promise<MealMenuEntry[]> {
  const entries = isFirebaseSelected
    ? (await getDocs(await userMenuCollection())).docs.map((item) => item.data() as MealMenuEntry)
    : readStorage<MealMenuEntry[]>(deviceMenuKey(), []);
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function storeMealMenuEntry(entry: MealMenuEntry): Promise<void> {
  if (isFirebaseSelected) {
    await setDoc(doc(await userMenuCollection(), entry.id), JSON.parse(JSON.stringify(entry)));
    return;
  }
  const key = deviceMenuKey();
  const saved = readStorage<MealMenuEntry[]>(key, []);
  writeStorage(key, [entry, ...saved.filter((item) => item.id !== entry.id)]);
}

export async function removeMealMenuEntry(id: string): Promise<void> {
  if (isFirebaseSelected) {
    await deleteDoc(doc(await userMenuCollection(), id));
    return;
  }
  const key = deviceMenuKey();
  writeStorage(key, readStorage<MealMenuEntry[]>(key, []).filter((entry) => entry.id !== id));
}
