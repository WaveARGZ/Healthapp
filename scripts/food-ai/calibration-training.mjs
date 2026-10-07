import { applyFoodCalibration } from "../../lib/food-ai/food-calibration.mjs";

function rankings(probabilities) {
  return probabilities.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value);
}

export function evaluate(rows, labelIds, model = null) {
  let top1 = 0;
  let top5 = 0;
  const mistakes = new Map();
  for (const row of rows) {
    const ranked = rankings(applyFoodCalibration(row.scores, labelIds, model));
    const correct = labelIds.indexOf(row.label);
    if (ranked[0].index === correct) top1 += 1;
    else {
      const pair = `${row.label} → ${labelIds[ranked[0].index]}`;
      mistakes.set(pair, (mistakes.get(pair) ?? 0) + 1);
    }
    if (ranked.slice(0, 5).some((item) => item.index === correct)) top5 += 1;
  }
  return {
    total: rows.length,
    top1,
    top5,
    top1Rate: rows.length ? top1 / rows.length : 0,
    top5Rate: rows.length ? top5 / rows.length : 0,
    commonMistakes: [...mistakes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([pair, count]) => ({ pair, count })),
  };
}

export function trainCalibration(rows, labelIds, regularization = 0.03, epochs = 180) {
  const n = labelIds.length;
  const weights = Array.from({ length: n }, () => Array(n).fill(0));
  const biases = Array(n).fill(0);
  const weightMoments = Array.from({ length: n }, () => Array(n).fill(0));
  const weightVariance = Array.from({ length: n }, () => Array(n).fill(0));
  const biasMoments = Array(n).fill(0);
  const biasVariance = Array(n).fill(0);
  const learningRate = 0.035;

  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    const gradients = Array.from({ length: n }, (_, i) => weights[i].map((value) => regularization * value));
    const biasGradients = biases.map((value) => regularization * value);
    for (const row of rows) {
      const logits = row.scores.map((score, i) => {
        let result = Math.log(Math.max(score, 1e-8)) + biases[i];
        for (let j = 0; j < n; j += 1) result += weights[i][j] * row.scores[j];
        return result;
      });
      const max = Math.max(...logits);
      const exps = logits.map((value) => Math.exp(value - max));
      const sum = exps.reduce((a, b) => a + b, 0);
      const truth = labelIds.indexOf(row.label);
      for (let i = 0; i < n; i += 1) {
        const error = (exps[i] / sum - Number(i === truth)) / rows.length;
        biasGradients[i] += error;
        for (let j = 0; j < n; j += 1) gradients[i][j] += error * row.scores[j];
      }
    }
    const correction1 = 1 - 0.9 ** epoch;
    const correction2 = 1 - 0.999 ** epoch;
    for (let i = 0; i < n; i += 1) {
      biasMoments[i] = 0.9 * biasMoments[i] + 0.1 * biasGradients[i];
      biasVariance[i] = 0.999 * biasVariance[i] + 0.001 * biasGradients[i] ** 2;
      biases[i] -= learningRate * (biasMoments[i] / correction1) / (Math.sqrt(biasVariance[i] / correction2) + 1e-8);
      for (let j = 0; j < n; j += 1) {
        weightMoments[i][j] = 0.9 * weightMoments[i][j] + 0.1 * gradients[i][j];
        weightVariance[i][j] = 0.999 * weightVariance[i][j] + 0.001 * gradients[i][j] ** 2;
        weights[i][j] -= learningRate * (weightMoments[i][j] / correction1) / (Math.sqrt(weightVariance[i][j] / correction2) + 1e-8);
      }
    }
  }
  return { schemaVersion: 1, status: "trained", baseModel: "Xenova/clip-vit-base-patch32", labelIds, weights, biases };
}

export function shouldPromote(baseline, trained) {
  return baseline.total >= 15 && trained.total === baseline.total &&
    trained.top1 >= baseline.top1 + 2 && trained.top5 >= baseline.top5;
}
