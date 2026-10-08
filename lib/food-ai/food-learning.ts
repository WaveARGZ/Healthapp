import { readStorage, writeStorage } from "@/lib/storage/local-storage";
import type { MealPhotoTrainingSample } from "@/types/meal";
import { getCloudSubject } from "@/lib/auth/cognito-session";
import { isCloudConfigured } from "@/lib/cloud/config";

const metadataKey = "bodymake.food-photo-training.v1";
const databaseName = "bodymake-food-photo-training";
const storeName = "samples";
const maxStoredSamples = 150;

interface StoredTrainingSample extends MealPhotoTrainingSample {
  image: Blob;
}

export interface FoodLearningSignal {
  confirmed: number;
  predicted: number;
}

function getSamples(): MealPhotoTrainingSample[] {
  const subject = isCloudConfigured ? getCloudSubject() : null;
  if (isCloudConfigured && !subject) return [];
  return readStorage<MealPhotoTrainingSample[]>(subject ? `${metadataKey}.${subject}` : metadataKey, []);
}

function openTrainingDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const subject = isCloudConfigured ? getCloudSubject() : null;
    if (isCloudConfigured && !subject) { resolve(null); return; }
    const request = window.indexedDB.open(subject ? `${databaseName}-${subject}` : databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeImageSample(sample: StoredTrainingSample, staleIds: string[]): Promise<void> {
  const database = await openTrainingDatabase();
  if (!database) return;

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    store.put(sample);
    staleIds.forEach((id) => store.delete(id));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

/** Keeps a locally labelled image and a compact feedback record for personal ranking. */
export async function recordFoodPhotoTrainingSample(input: {
  id: string;
  image: Blob;
  predictedFoodIds: string[];
  confirmedFoodId: string;
  confirmedFoodName: string;
  nutrition: { calories: number; proteinG: number; fatG: number; carbsG: number };
  createdAt: string;
}): Promise<void> {
  const subject = isCloudConfigured ? getCloudSubject() : null;
  if (isCloudConfigured && !subject) throw new Error("ログインが必要です。");
  const sample: MealPhotoTrainingSample = {
    id: input.id,
    predictedFoodIds: input.predictedFoodIds,
    confirmedFoodId: input.confirmedFoodId,
    confirmedFoodName: input.confirmedFoodName,
    nutrition: input.nutrition,
    createdAt: input.createdAt,
  };
  const existing = getSamples();
  const next = [sample, ...existing].slice(0, maxStoredSamples);
  const staleIds = existing.slice(maxStoredSamples - 1).map((item) => item.id);
  writeStorage(subject ? `${metadataKey}.${subject}` : metadataKey, next);

  if (!isCloudConfigured) {
    try {
      await storeImageSample({ ...sample, image: input.image }, staleIds);
    } catch {
      // The feedback metadata is still useful for local ranking if image storage is unavailable.
    }
  }
}

export function getFoodLearningSignals(): Record<string, FoodLearningSignal> {
  return getSamples().reduce<Record<string, FoodLearningSignal>>((signals, sample) => {
    const confirmed = signals[sample.confirmedFoodId] ?? { confirmed: 0, predicted: 0 };
    signals[sample.confirmedFoodId] = { ...confirmed, confirmed: confirmed.confirmed + 1 };
    sample.predictedFoodIds.forEach((foodId) => {
      const predicted = signals[foodId] ?? { confirmed: 0, predicted: 0 };
      signals[foodId] = { ...predicted, predicted: predicted.predicted + 1 };
    });
    return signals;
  }, {});
}
