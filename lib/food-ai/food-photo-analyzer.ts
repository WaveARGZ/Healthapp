import { foodCatalog, type FoodCatalogItem } from "@/lib/food-ai/food-catalog";
import { getFoodLearningSignals } from "@/lib/food-ai/food-learning";
import { applyFoodCalibration, FOOD_BASE_MODEL } from "@/lib/food-ai/food-calibration.mjs";
import deployedCalibration from "@/lib/food-ai/deployed-calibration.json";

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
      .then(async ({ pipeline }) => pipeline("zero-shot-image-classification", FOOD_BASE_MODEL, {
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
  const rawScores = new Map(outputs.map((output) => [output.label, output.score]));
  const labelIds = foodCatalog.map((food) => food.id);
  const probabilities = applyFoodCalibration(
    foodCatalog.map((food) => rawScores.get(food.clipLabel) ?? 0),
    labelIds,
    deployedCalibration,
  );
  const signals = getFoodLearningSignals();

  return foodCatalog
    .map((item, index) => {
      const modelScore = probabilities[index];
      const learnedBoost = Math.min(0.12, (signals[item.id]?.confirmed ?? 0) * 0.02);
      return { ...item, modelScore, score: Math.min(1, modelScore + learnedBoost) };
    })
    .sort((first, second) => second.score - first.score)
    .slice(0, 5);
}
