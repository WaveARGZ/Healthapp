import assert from "node:assert/strict";
import test from "node:test";
import { equipmentGroupForExercise, exerciseCatalog, groupExercisesByEquipment } from "../lib/data/exercise-catalog.ts";

test("胸の種目はマシーン、バーベル、ダンベル、自重の順に表示する", () => {
  const chest = exerciseCatalog.find((category) => category.label === "胸");
  const groups = groupExercisesByEquipment(chest.groups.flatMap((group) => group.exercises));
  assert.deepEqual(groups.map((group) => group.label), ["マシーン種目", "バーベル種目", "ダンベル種目", "その他・自重"]);
  assert.ok(groups[0].exercises.includes("チェストプレス"));
  assert.ok(groups[1].exercises.includes("バーベルベンチプレス"));
  assert.ok(groups[2].exercises.includes("ダンベルベンチプレス"));
  assert.ok(groups[3].exercises.includes("プッシュアップ"));
});

test("器具別に分けても種目は欠けず、同名は重複しない", () => {
  for (const category of exerciseCatalog) {
    const names = category.groups.flatMap((group) => group.exercises);
    const grouped = groupExercisesByEquipment(names).flatMap((group) => group.exercises);
    assert.equal(grouped.length, new Set(names).size, category.label);
    assert.deepEqual(new Set(grouped), new Set(names), category.label);
  }
});

test("自重のレッグカールとアダクションはマシーンに分類しない", () => {
  assert.equal(equipmentGroupForExercise("タオルレッグカール"), "その他・自重");
  assert.equal(equipmentGroupForExercise("サイドライイングアダクション"), "その他・自重");
  assert.equal(equipmentGroupForExercise("エアロバイク"), "マシーン種目");
  assert.equal(equipmentGroupForExercise("ランドマインプレス"), "バーベル種目");
});
