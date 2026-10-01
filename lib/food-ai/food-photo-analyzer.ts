import { foodCatalog, type FoodCatalogItem } from "@/lib/food-ai/food-catalog";
import { getFoodLearningSignals } from "@/lib/food-ai/food-learning";

export interface FoodPhotoCandidate extends FoodCatalogItem {
  score: number;
  modelScore: number;
}

export interface ModelProgress {
  label: string;
  percent?: number;
}

type ImageClassifier = (image: Blob, candidateLabels: string[]) => Promise<Array<{ label: string; score: number }>>;

let classifierPromise: Promise<ImageClassifier> | null = null;

async function getClassifier(onProgress?: (progress: ModelProgress) => void): Promise<ImageClassifier> {
  if (!classifierPromise) {
    classifierPromise = import("@huggingface/transformers")
      .then(async ({ pipeline }) => pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", {
        // Prefer the smaller quantized model for mobile devices.
        dtype: "q4",
        progress_callback: (info) => onProgress?.({
          label: info.status === "ready" ? "モデルを準備しています" : "無料AIモデルをダウンロードしています",
          percent: "progress" in info ? Math.round(info.progress) : undefined,
        }),
      }) as unknown as ImageClassifier)
      .catch((error: unknown) => {
        classifierPromise = null;
        throw error;
      });
  }
  return classifierPromise;
}

/**
 * Runs on the device. The photo is passed to the browser model, not sent to an
 * inference API. Results are suggestions and should be confirmed by the user.
 */
export async function analyzeFoodPhoto(
  image: Blob,
  onProgress?: (progress: ModelProgress) => void,
): Promise<FoodPhotoCandidate[]> {
  const classifier = await getClassifier(onProgress);
  onProgress?.({ label: "写真から料理候補を探しています" });
  const outputs = await classifier(image, foodCatalog.map((food) => food.clipLabel));
  const signals = getFoodLearningSignals();

  return outputs
    .map((output) => {
      const item = foodCatalog.find((food) => food.clipLabel === output.label);
      if (!item) return null;
      const learnedBoost = Math.min(0.12, (signals[item.id]?.confirmed ?? 0) * 0.02);
      return { ...item, modelScore: output.score, score: Math.min(1, output.score + learnedBoost) };
    })
    .filter((candidate): candidate is FoodPhotoCandidate => candidate !== null)
    .sort((first, second) => second.score - first.score)
    .slice(0, 5);
}
