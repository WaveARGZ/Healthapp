import { applyFoodCalibration, FOOD_BASE_MODEL, FOOD_BASE_REVISION } from "../../lib/food-ai/food-calibration.mjs";

function rankings(probabilities) {
  return probabilities.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value);
}

function validateRows(rows, labelIds) {
  if (!Array.isArray(rows) || !labelIds.length || new Set(labelIds).size !== labelIds.length) throw new Error("学習ラベルまたはデータが不正です");
  for (const row of rows) {
    if (!labelIds.includes(row.label) || !Array.isArray(row.scores) || row.scores.length !== labelIds.length ||
      row.scores.some((score) => !Number.isFinite(score) || score < 0) || row.scores.reduce((a, b) => a + b, 0) <= 0) {
      throw new Error("学習スコアまたは正解ラベルが不正です");
    }
  }
}

export function evaluate(rows, labelIds, model = null) {
  validateRows(rows, labelIds);
  let top1 = 0;
  let top5 = 0;
  const mistakes = new Map();
  const perClass = Object.fromEntries(labelIds.map((id) => [id, { total: 0, top1: 0, top5: 0, top1Rate: 0, top5Rate: 0 }]));
  const outcomes = [];
  for (const row of rows) {
    const ranked = rankings(applyFoodCalibration(row.scores, labelIds, model));
    const correct = labelIds.indexOf(row.label);
    const correctTop1 = ranked[0].index === correct;
    const correctTop5 = ranked.slice(0, 5).some((item) => item.index === correct);
    perClass[row.label].total += 1;
    perClass[row.label].top1 += Number(correctTop1);
    perClass[row.label].top5 += Number(correctTop5);
    outcomes.push({ id: row.id, label: row.label, prediction: labelIds[ranked[0].index], top1: correctTop1, top5: correctTop5 });
    if (correctTop1) top1 += 1;
    else {
      const pair = `${row.label} → ${labelIds[ranked[0].index]}`;
      mistakes.set(pair, (mistakes.get(pair) ?? 0) + 1);
    }
    if (correctTop5) top5 += 1;
  }
  const classes = Object.values(perClass).filter((item) => item.total > 0);
  for (const item of classes) {
    item.top1Rate = item.top1 / item.total;
    item.top5Rate = item.top5 / item.total;
  }
  return {
    total: rows.length,
    top1,
    top5,
    top1Rate: rows.length ? top1 / rows.length : 0,
    top5Rate: rows.length ? top5 / rows.length : 0,
    macroTop1Rate: classes.length ? classes.reduce((sum, item) => sum + item.top1Rate, 0) / classes.length : 0,
    macroTop5Rate: classes.length ? classes.reduce((sum, item) => sum + item.top5Rate, 0) / classes.length : 0,
    perClass,
    outcomes,
    commonMistakes: [...mistakes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([pair, count]) => ({ pair, count })),
  };
}

export function trainCalibration(rows, labelIds, regularization = 0.03, epochs = 180) {
  validateRows(rows, labelIds);
  if (!rows.length) throw new Error("学習データがありません");
  const n = labelIds.length;
  const classCounts = new Map();
  for (const row of rows) classCounts.set(row.label, (classCounts.get(row.label) ?? 0) + 1);
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
        // Each represented dish contributes equally despite collection imbalance.
        const error = (exps[i] / sum - Number(i === truth)) / (classCounts.size * classCounts.get(row.label));
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
  return { schemaVersion: 1, status: "trained", baseModel: FOOD_BASE_MODEL, baseRevision: FOOD_BASE_REVISION, labelIds, weights, biases };
}

/** Paired exact sign test on the same images; descriptive for repeated holdout use. */
export function pairedImprovement(reference, candidate) {
  if (reference.outcomes.length !== candidate.outcomes.length) throw new Error("同じ画像で評価した結果が必要です");
  let improved = 0;
  let regressed = 0;
  for (let i = 0; i < reference.outcomes.length; i += 1) {
    const a = reference.outcomes[i];
    const b = candidate.outcomes[i];
    if (a.id !== b.id || a.label !== b.label) throw new Error("比較する評価画像の順序が一致しません");
    improved += Number(!a.top1 && b.top1);
    regressed += Number(a.top1 && !b.top1);
  }
  const discordant = improved + regressed;
  // Log probabilities avoid overflow in n choose k for larger test sets.
  let logCombination = 0;
  let probability = 0;
  for (let k = 0; k <= discordant; k += 1) {
    if (k >= improved) probability += Math.exp(logCombination - discordant * Math.LN2);
    if (k < discordant) logCombination += Math.log(discordant - k) - Math.log(k + 1);
  }
  return { improved, regressed, unchanged: reference.total - discordant, oneSidedP: Math.min(1, probability) };
}

export function assessPromotion(reference, candidate) {
  const reasons = [];
  const paired = pairedImprovement(reference, candidate);
  if (reference.total < 30 || candidate.total !== reference.total) reasons.push("独立した評価画像が30枚未満、または比較件数が不一致");
  if (candidate.top1 < reference.top1 + 2) reasons.push("1位正解が2件以上改善していない");
  if (candidate.top5 < reference.top5) reasons.push("上位5件の正解率が悪化");
  if (candidate.macroTop1Rate + 1e-12 < reference.macroTop1Rate || candidate.macroTop5Rate + 1e-12 < reference.macroTop5Rate) reasons.push("料理ごとの平均正解率が悪化");
  const regressedClasses = Object.keys(reference.perClass).filter((id) => {
    const a = reference.perClass[id];
    const b = candidate.perClass[id];
    return !b || a.total !== b.total || b.top1 < a.top1 || b.top5 < a.top5;
  });
  if (regressedClasses.length) reasons.push(`悪化した料理: ${regressedClasses.join(", ")}`);
  if (paired.oneSidedP > 0.1) reasons.push("対応のある改善比較の根拠が不足（片側p値 > 0.1）");
  return { passed: reasons.length === 0, reasons, paired, regressedClasses };
}

export const shouldPromote = (reference, candidate) => assessPromotion(reference, candidate).passed;
