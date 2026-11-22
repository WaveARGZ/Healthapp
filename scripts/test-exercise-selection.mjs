import assert from "node:assert/strict";
import test from "node:test";
import { equipmentGroupForExercise, exerciseCatalog, groupExercisesByEquipment } from "../lib/data/exercise-catalog.ts";
import { matchesExerciseName, registeredExerciseForName, registrationExercises } from "../lib/data/registration-exercise-catalog.ts";
import { fitsWorkoutLocation, recommendExercises } from "../lib/workouts/workout-recommender.ts";
import { defaultStrengthSetCount, formatWorkoutSet, isCardioExercise, selectDraftExercise, setsFor } from "../lib/workouts/workout-sets.ts";
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

test("週間メニューのジム設定と登録した器具で標準種目を絞り込む", () => {
  assert.equal(fitsWorkoutLocation("チェアスクワット", false, []), true);
  assert.equal(fitsWorkoutLocation("低負荷のステップタッチ", false, []), true);
  assert.equal(fitsWorkoutLocation("インクラインマシンチェストプレス", false, ["ウェイトマシン"]), false);
  assert.equal(fitsWorkoutLocation("インクラインマシンチェストプレス", true, ["ウェイトマシン"]), true);
  assert.equal(fitsWorkoutLocation("スキーエルゴ", true, ["エアロバイク"]), false);
  assert.equal(fitsWorkoutLocation("スキーエルゴ", true, []), true);
  assert.equal(fitsWorkoutLocation("ベンチプレス", undefined, []), true);
  assert.equal(fitsWorkoutLocation("ベンチプレス", true, ["バーベル"]), false);
});

test("有酸素は1行で始まり、種目を切り替えても各入力の下書きを保持する", () => {
  let nextId = 0;
  const createSet = () => ({ id: `set-${++nextId}`, completed: false });
  const strengthSets = Array.from({ length: defaultStrengthSetCount }, createSet);
  strengthSets[0].weightKg = 30;
  const strength = { id: "exercise", name: "ベンチプレス", category: "胸", setRecords: strengthSets };
  const cardioSelection = { name: "トレッドミル", category: "有酸素" };
  const cardio = selectDraftExercise(strength, cardioSelection, createSet);
  assert.equal(cardio.setRecords.length, 1);
  assert.equal(cardio.setRecords[0].weightKg, undefined);
  cardio.setRecords[0].durationMinutes = 12.5;
  cardio.setRecords.push({ ...createSet(), distanceKm: 2.75 });
  const backToStrength = selectDraftExercise(cardio, { name: strength.name, category: strength.category }, createSet);
  assert.deepEqual(backToStrength.setRecords, strengthSets);
  const backToCardio = selectDraftExercise(backToStrength, cardioSelection, createSet);
  assert.deepEqual(backToCardio.setRecords, cardio.setRecords);
});

test("有酸素の履歴は分とkmを表示し、以前の重量とレップ数は旧単位で表示する", () => {
  const stored = { id: "exercise", name: "ランニング", setRecords: [{ id: "recorded", durationMinutes: 12.5, distanceKm: 2.75, completed: true }] };
  assert.equal(isCardioExercise(stored), true);
  assert.equal(isCardioExercise({ name: "自分の運動", category: "有酸素" }), true);
  assert.equal(formatWorkoutSet(stored, setsFor(JSON.parse(JSON.stringify(stored)))[0]), "12.5 分・2.75 km");
  const legacy = { id: "legacy", name: "ランニング", weightKg: 30, reps: 8 };
  assert.equal(formatWorkoutSet(legacy, setsFor(legacy)[0]), "30 kg × 8 回");
});
