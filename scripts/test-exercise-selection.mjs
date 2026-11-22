import assert from "node:assert/strict";
import test from "node:test";
import { equipmentGroupForExercise, exerciseCatalog, groupExercisesByEquipment } from "../lib/data/exercise-catalog.ts";
import { matchesExerciseName, registeredExerciseForName, registrationExercises } from "../lib/data/registration-exercise-catalog.ts";
import { recommendExercises } from "../lib/workouts/workout-recommender.ts";
import { normalizeWorkoutPreferences } from "../types/workout-preferences.ts";

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

test("登録メニューで定番種目を正しい部位と器具に分類する", () => {
  assert.equal(new Set(registrationExercises.map((item) => item.name)).size, registrationExercises.length);
  for (const [name, bodyPart, group] of [
    ["ベンチプレス", "胸", "バーベル種目"],
    ["シーテッドケーブルロー", "背中", "マシーン種目"],
    ["ダンベルブルガリアンスクワット", "脚", "ダンベル種目"],
    ["ルーマニアンデッドリフト", "脚", "バーベル種目"],
    ["サイドプランク", "腹筋・体幹", "その他・自重"],
    ["リバースペックデック", "肩", "マシーン種目"],
    ["EZバーカール", "腕", "バーベル種目"],
  ]) {
    const exercise = registeredExerciseForName(name);
    assert.deepEqual([exercise?.category, exercise?.group], [bodyPart, group]);
  }
  assert.deepEqual(registeredExerciseForName("シーテッドケーブルロー").requiredEquipment, ["ケーブルマシン"]);
});

test("旧名での検索とお気に入りが、新しい表示名でも使える", () => {
  assert.equal(matchesExerciseName("腕立て伏せ", "ぷっしゅ・あっぷ"), true);
  assert.equal(matchesExerciseName("ペックフライ", "ペックデックフライ"), true);
  assert.equal(matchesExerciseName("懸垂", "チンニング"), true);
  assert.equal(matchesExerciseName("ルーマニアンデッドリフト", "ｒｄｌ"), true);
  assert.equal(matchesExerciseName("ダンベルサイドレイズ", "サイドレイズ"), true);
  const preferences = normalizeWorkoutPreferences({
    favoriteExercises: ["バーベルベンチプレス", "ベンチプレス", "アダクション", "プッシュアップ"],
    customExercises: [{ name: "プッシュアップ", category: "腕" }],
  });
  assert.deepEqual(preferences.favoriteExercises, ["ベンチプレス", "ヒップアダクション", "プッシュアップ"]);
});

test("おすすめでは追加した種目に必要な器具を確認する", () => {
  const favorites = ["ゴブレットスクワット", "バーベルスクワット", "ダンベルブルガリアンスクワット"];
  const result = recommendExercises({ favorites, workouts: [], query: "", selectedCategory: "脚", availableEquipment: ["ダンベル"] });
  assert.deepEqual(result.map((item) => item.name), ["ゴブレットスクワット"]);
});
