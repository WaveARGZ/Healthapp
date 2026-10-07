import assert from "node:assert/strict";
import test from "node:test";
import { applyFoodCalibration, isFoodCalibrationModel } from "../../lib/food-ai/food-calibration.mjs";
import { evaluate, shouldPromote, trainCalibration } from "./calibration-training.mjs";

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
  assert.ok(evaluate(rows, labelIds, model).top1 > evaluate(rows, labelIds).top1);
  assert.equal(applyFoodCalibration([0.2, 0.3, 0.5], labelIds, null)[2], 0.5);
});

test("アプリ反映には未使用テストで2件以上の改善と上位5件維持が必要", () => {
  assert.equal(shouldPromote({ total: 20, top1: 10, top5: 19 }, { total: 20, top1: 12, top5: 19 }), true);
  assert.equal(shouldPromote({ total: 20, top1: 10, top5: 19 }, { total: 20, top1: 11, top5: 20 }), false);
  assert.equal(shouldPromote({ total: 20, top1: 10, top5: 19 }, { total: 20, top1: 12, top5: 18 }), false);
});
