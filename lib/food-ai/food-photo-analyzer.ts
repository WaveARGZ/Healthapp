import { foodCatalog, type FoodCatalogItem } from "@/lib/food-ai/food-catalog";
import { applyFoodCalibration, FOOD_BASE_MODEL, FOOD_BASE_REVISION } from "@/lib/food-ai/food-calibration.mjs";
import deployedCalibration from "@/lib/food-ai/deployed-calibration.json";
import testCalibration from "@/lib/food-ai/test-calibration.json";
import { useTestFoodModel } from "@/lib/cloud/config";
import { applyEmbeddingCalibration, extractClipFeatures } from "@/lib/food-ai/clip-features.mjs";
import { buildPhotoHistory } from "@/lib/food-ai/photo-history";
import type { MealEntry } from "@/types/meal";

export interface FoodPhotoCandidate extends FoodCatalogItem {
  score: number;
  modelScore: number;
}

export interface FoodPhotoAnalysis {
  candidates: FoodPhotoCandidate[];
  /** Scores in the stable order of foodCatalog; used only with a confirmed label. */
  scores: number[];
  historyCandidates?: FoodPhotoCandidate[];
  recommendedCandidateId?: string;
}

export interface ModelProgress {
  label: string;
  percent?: number;
}

type ImageClassifier = (image: Blob, candidateLabels: string[]) => Promise<Array<{ label: string; score: number }>>;

let classifierPromise: Promise<ImageClassifier> | null = null;

async function getStreamingTestModel(): Promise<unknown> {
  if (!useTestFoodModel || typeof window === "undefined" || !["localhost", "127.0.0.1"].includes(window.location.hostname)) return null;
  try {
    // The local launcher verifies Drive permissions, consent and a full model readback.
    // A 2-second deadline would silently discard valid models on real Drive latency.
    const response = await fetch("http://127.0.0.1:3002/test-model", { cache: "no-store", signal: AbortSignal.timeout(60000) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

async function getClassifier(onProgress?: (progress: ModelProgress) => void): Promise<ImageClassifier> {
  if (!classifierPromise) {
    classifierPromise = import("@huggingface/transformers")
      .then(async ({ pipeline }) => pipeline("zero-shot-image-classification", FOOD_BASE_MODEL, {
        // Prefer the smaller quantized model for mobile devices.
        dtype: "q4",
        revision: FOOD_BASE_REVISION,
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
  return (await analyzeFoodPhotoDetailed(image, onProgress)).candidates;
}

export async function analyzeFoodPhotoDetailed(
  image: Blob,
  onProgress?: (progress: ModelProgress) => void,
  options: { previousMeals?: readonly MealEntry[] } = {},
): Promise<FoodPhotoAnalysis> {
  const history = buildPhotoHistory(options.previousMeals ?? [], foodCatalog);
  const compared = [...foodCatalog, ...history];
  const clipLabels = compared.map((food) => food.clipLabel);
  const classifier = await getClassifier(onProgress);
  onProgress?.({ label: useTestFoodModel ? "テストモデルの保存先を確認しています" : "写真から料理候補を探しています" });
  const streamingModel = await getStreamingTestModel();
  onProgress?.({ label: "写真から料理候補を探しています" });
  let allScores: number[];
  let embedding: number[] | undefined;
  if (streamingModel) {
    const { RawImage, env } = await import("@huggingface/transformers");
    if (env.version !== "4.3.0") throw new Error("テストモデルとAIライブラリの版が一致しません。");
    const features = await extractClipFeatures(classifier, image, clipLabels, RawImage);
    allScores = features.scores;
    embedding = features.embedding;
  } else {
    const outputs = await classifier(image, clipLabels);
    const rawScores = new Map(outputs.map((output) => [output.label, output.score]));
    allScores = clipLabels.map((label) => rawScores.get(label) ?? 0);
  }
  const labelIds = foodCatalog.map((food) => food.id);
  const raw = allScores.slice(0, foodCatalog.length);
  const total = raw.reduce((sum, value) => sum + value, 0);
  const normalized = total > 0 ? raw.map((value) => value / total) : raw.map(() => 1 / raw.length);
  // The existing correction head still receives exactly its original label set.
  const probabilities = embedding ? applyEmbeddingCalibration(normalized, embedding, labelIds, foodCatalog.map((food) => food.clipLabel), streamingModel) : applyFoodCalibration(
    normalized,
    labelIds,
    useTestFoodModel ? testCalibration : deployedCalibration,
  );

  const candidates = foodCatalog
    .map((item, index) => {
      const modelScore = probabilities[index];
      // Meal frequency is not image evidence; preserve the evaluated ranking.
      return { ...item, modelScore, score: modelScore };
    })
    .sort((first, second) => second.score - first.score)
    .slice(0, 5);
  const historyCandidates = history.map((food, index) => ({ ...food,
    score: allScores[foodCatalog.length + index], modelScore: allScores[foodCatalog.length + index] }))
    .filter((food) => Number.isFinite(food.score) && food.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, 3);
  // Compare on the joint score scale, while retaining the evaluated base ranking.
  const bestBase = candidates[0];
  const bestHistory = historyCandidates[0];
  const recommendedCandidateId = bestHistory && bestHistory.score > (bestBase?.score ?? 0) * total
    ? bestHistory.id : bestBase?.id;
  // Store base scores so supplemental corrections are not calibrated twice.
  return { candidates, scores: normalized, historyCandidates, recommendedCandidateId };
}
