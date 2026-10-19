import { FOOD_BASE_MODEL, FOOD_BASE_REVISION, softmax } from "./food-calibration.mjs";

export const CLIP_FEATURE_CONTRACT = {
  baseModel: FOOD_BASE_MODEL, baseRevision: FOOD_BASE_REVISION, dtype: "q4",
  transformersVersion: "4.3.0", template: "This is a photo of {}", featureSize: 512,
};

/** Same model, preprocessing, prompts and normalization in browser and training worker. */
export async function extractClipFeatures(classifier, image, labels, RawImage) {
  const prepared = await RawImage.read(image);
  const text = classifier.tokenizer(labels.map((label) => CLIP_FEATURE_CONTRACT.template.replace("{}", label)), { padding: true, truncation: true });
  const { pixel_values } = await classifier.processor([prepared]);
  const output = await classifier.model({ ...text, pixel_values });
  const scores = softmax(Array.from(output.logits_per_image.data));
  const raw = Array.from(output.image_embeds.data);
  const norm = Math.hypot(...raw);
  if (raw.length !== 512 || !Number.isFinite(norm) || norm === 0 || scores.length !== labels.length) throw new Error("CLIP feature contract mismatch");
  return { scores, embedding: raw.map((x) => x / norm) };
}

export function applyEmbeddingCalibration(scores, embedding, labelIds, clipLabels, model) {
  if (!model || model.schemaVersion !== 2 || model.status !== "trained" ||
    JSON.stringify(model.contract) !== JSON.stringify(CLIP_FEATURE_CONTRACT) ||
    JSON.stringify(model.labelIds) !== JSON.stringify(labelIds) || JSON.stringify(model.clipLabels) !== JSON.stringify(clipLabels) ||
    embedding.length !== 512 || embedding.some((x) => !Number.isFinite(x)) ||
    !Array.isArray(model.weights) || model.weights.length !== labelIds.length ||
    model.weights.some((row) => !Array.isArray(row) || row.length !== 512 || row.some((x) => !Number.isFinite(x))) ||
    !Array.isArray(model.biases) || model.biases.length !== labelIds.length || model.biases.some((x) => !Number.isFinite(x))) return scores;
  return softmax(scores.map((p, i) => Math.log(Math.max(p, 1e-8)) + model.biases[i] + model.weights[i].reduce((s, w, j) => s + w * embedding[j], 0)));
}
