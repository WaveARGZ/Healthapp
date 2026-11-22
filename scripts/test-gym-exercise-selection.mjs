import assert from "node:assert/strict";
import test from "node:test";
import { fitsWorkoutLocation, recommendExercises } from "../lib/workouts/workout-recommender.ts";

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

test("ジムなしのおすすめには保存済みのジム器具を使う種目が出ない", () => {
  const input = {
    availableEquipment: ["ウェイトマシン"],
    favorites: ["チェストプレス", "腕立て伏せ"],
    workouts: [],
    selectedCategory: "胸",
    query: "",
  };
  const home = recommendExercises({ ...input, isGymMember: false });
  const gym = recommendExercises({ ...input, isGymMember: true });
  assert.deepEqual(home.map(({ name }) => name), ["腕立て伏せ"]);
  assert.deepEqual(new Set(gym.map(({ name }) => name)), new Set(input.favorites));
});
