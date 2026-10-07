export const FOOD_BASE_MODEL = "Xenova/clip-vit-base-patch32";

/**
 * @typedef {{ schemaVersion: 1, status: "trained", baseModel: string, labelIds: string[], weights: number[][], biases: number[] }} FoodCalibrationModel
 */

/** @param {unknown} value @param {string[]} labelIds @returns {value is FoodCalibrationModel} */
export function isFoodCalibrationModel(value, labelIds) {
  if (!value || typeof value !== "object") return false;
  const model = /** @type {Record<string, unknown>} */ (value);
  const count = labelIds.length;
  return model.schemaVersion === 1 && model.status === "trained" && model.baseModel === FOOD_BASE_MODEL &&
    Array.isArray(model.labelIds) && model.labelIds.length === count && model.labelIds.every((id, index) => id === labelIds[index]) &&
    Array.isArray(model.biases) && model.biases.length === count && model.biases.every((item) => typeof item === "number" && Number.isFinite(item)) &&
    Array.isArray(model.weights) && model.weights.length === count && model.weights.every((row) =>
      Array.isArray(row) && row.length === count && row.every((item) => typeof item === "number" && Number.isFinite(item)));
}

/** @param {number[]} logits @returns {number[]} */
export function softmax(logits) {
  const maximum = Math.max(...logits);
  const exponentials = logits.map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
}

/**
 * A small learned correction head over CLIP's probability vector. Invalid or absent
 * artifacts are ignored so the original model remains usable.
 * @param {number[]} probabilities
 * @param {string[]} labelIds
 * @param {unknown} model
 * @returns {number[]}
 */
export function applyFoodCalibration(probabilities, labelIds, model) {
  if (probabilities.length !== labelIds.length || !isFoodCalibrationModel(model, labelIds)) return probabilities;
  if (probabilities.some((value) => !Number.isFinite(value) || value < 0)) return probabilities;

  const logits = probabilities.map((probability, index) => {
    let correction = model.biases[index];
    for (let feature = 0; feature < probabilities.length; feature += 1) {
      correction += model.weights[index][feature] * probabilities[feature];
    }
    return Math.log(Math.max(probability, 1e-8)) + correction;
  });
  return softmax(logits);
}
