import assert from "node:assert/strict";
import test from "node:test";
import { applyFoodCalibration, isFoodCalibrationModel } from "../../lib/food-ai/food-calibration.mjs";
import { assessPromotion, evaluate, pairedImprovement, shouldPromote, trainCalibration } from "./calibration-training.mjs";

test("学習した補正器は既知の誤分類を改善し、形式を検証できる", () => {
  const labelIds = ["rice", "soup", "fish"];
  const rows = Array.from({ length: 45 }, (_, index) => {
    const truth = index % 3;
    const scores = truth === 0 ? [0.35, 0.55, 0.1] :
      truth === 1 ? [0.2, 0.4, 0.4] : [0.1, 0.2, 0.7];
    return { label: labelIds[truth], scores };
  });
  const model = trainCalibration(rows, labelIds, 0.01, 120);
  assert.equal(isFoodCalibrationModel(model, labelIds), true);
  assert.equal(isFoodCalibrationModel({ ...model, baseModel: "other" }, labelIds), false);
  assert.equal(isFoodCalibrationModel({ ...model, baseRevision: "old-revision" }, labelIds), false);
  assert.ok(evaluate(rows, labelIds, model).top1 > evaluate(rows, labelIds).top1);
  assert.equal(applyFoodCalibration([0.2, 0.3, 0.5], labelIds, null)[2], 0.5);
});

const labels = ["rice", "soup", "fish", "salad", "egg", "tofu"];
function evaluationWithMistakes(mistakeIds) {
  return evaluate(Array.from({ length: 60 }, (_, id) => {
    const truth = id % labels.length;
    const predicted = mistakeIds.includes(id) ? (truth + 1) % labels.length : truth;
    const scores = labels.map((_, index) => index === predicted ? 0.8 : 0.04);
    return { id: String(id), label: labels[truth], scores };
  }), labels);
}

test("対応のある改善・料理別維持・比較件数をそろえた候補だけ反映", () => {
  const baseline = evaluationWithMistakes([0, 1, 2, 3, 4, 5, 6, 7]);
  const improved = evaluationWithMistakes([]);
  assert.equal(shouldPromote(baseline, improved), true);
  const paired = pairedImprovement(baseline, improved);
  assert.deepEqual({ ...paired, oneSidedP: undefined }, { improved: 8, regressed: 0, unchanged: 52, oneSidedP: undefined });
  assert.ok(Math.abs(paired.oneSidedP - 1 / 256) < 1e-12);
  assert.equal(shouldPromote(baseline, baseline), false);
  const twoGains = evaluationWithMistakes([0, 1, 2, 3, 4, 5]);
  assert.equal(shouldPromote(baseline, twoGains), false, "2件だけの改善は偶然を否定する根拠が不足");
});

test("全体正解が改善しても特定料理の悪化は拒否", () => {
  const baseline = evaluationWithMistakes([0, 6, 12, 18, 24, 30, 36, 42]);
  const candidate = evaluationWithMistakes([1]);
  assert.ok(candidate.top1 > baseline.top1);
  const verdict = assessPromotion(baseline, candidate);
  assert.equal(verdict.passed, false);
  assert.deepEqual(verdict.regressedClasses, ["soup"]);
});

test("ベースモデルを上回っても現行モデルを下回る更新は拒否", () => {
  const baseline = evaluationWithMistakes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const incumbent = evaluationWithMistakes([]);
  const candidate = evaluationWithMistakes([0]);
  assert.equal(shouldPromote(baseline, candidate), true);
  assert.equal(shouldPromote(incumbent, candidate), false);
});

test("異なる評価画像や未知ラベルを混ぜる比較は拒否", () => {
  const baseline = evaluationWithMistakes([]);
  const reordered = structuredClone(baseline);
  reordered.outcomes.reverse();
  assert.throws(() => pairedImprovement(baseline, reordered), /順序/);
  assert.throws(() => trainCalibration([{ label: "unknown", scores: [0.5, 0.5] }], ["rice", "fish"]), /不正/);
});
