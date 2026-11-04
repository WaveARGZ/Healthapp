import assert from "node:assert/strict";
import test from "node:test";
import library from "../lib/data/food-library.json" with { type: "json" };
import { beginnerExerciseCatalog } from "../lib/data/beginner-exercise-catalog.ts";
import { featureNames, recommendationCatalogIds, recommendationExercises, recommendationMeals } from "../lib/recommendations/catalog.ts";
import { buildRecommendationContext, recommendLocally, toRecommendationRequest } from "../lib/recommendations/engine.ts";

// All fixtures are synthetic and RAM-only. No filesystem writes, accounts, network or API calls.
const profile = { id: "synthetic-profile", name: "NEVER SEND NAME", email: "private@example.invalid", age: 30, goal: "build-muscle", updatedAt: "2026-11-04" };
const constraints = { pain: false, tired: false, dietaryRestriction: false, professionalGuidance: false, availableMinutes: 30 };
const preferences = { facilityEquipment: [], customEquipment: [], favoriteExercises: ["自重スクワット", "プッシュアップ", "ウォーキング"] };
const base = { profile, meals: [], workouts: [], preferences, date: "2026-11-04", constraints };
const input = (overrides = {}) => ({ ...base, ...overrides });
const meal = (overrides = {}) => ({ id: "meal-a", mealType: "lunch", name: "PRIVATE MEAL TEXT", recordedAt: "2026-11-04", createdAt: "2026-11-04", ...overrides });
const workout = (name, date, completed = true) => ({ id: `workout-${name}-${date}`, performedAt: date, createdAt: date, exercises: [{ id: "exercise-a", name, setRecords: [{ id: "set-a", reps: 8, weightKg: 0, completed }] }] });
const ofKind = (context, kind) => context.candidates.filter((candidate) => candidate.kind === kind);

test("empty history remains unknown, not an invented zero intake", () => {
  const context = buildRecommendationContext(input());
  assert.equal(context.nutrition.mealCount, 0);
  assert.deepEqual(context.nutrition.totals, { calories: null, proteinG: null, fatG: null, carbsG: null });
  assert.deepEqual(context.nutrition.complete, { calories: false, proteinG: false, fatG: false, carbsG: false });
  assert.equal(ofKind(context, "meal").length, 8);
  assert.ok(context.notices.some((notice) => notice.includes("未記録を0とは扱いません")));
});

test("each nutrient independently distinguishes missing from an explicit zero", () => {
  const context = buildRecommendationContext(input({ meals: [meal({ calories: 300, proteinG: 0, fatG: 10 })] }));
  assert.deepEqual(context.nutrition.totals, { calories: 300, proteinG: 0, fatG: 10, carbsG: null });
  assert.deepEqual(context.nutrition.complete, { calories: true, proteinG: true, fatG: true, carbsG: false });
});

test("items and scalar totals are never double-counted", () => {
  const context = buildRecommendationContext(input({ meals: [meal({ calories: 900, proteinG: 90, fatG: 90, carbsG: 90,
    items: [{ id: "food-a", name: "Synthetic A", calories: 100, proteinG: 10, fatG: 5, carbsG: 20 }, { id: "food-b", name: "Synthetic B", calories: 200, proteinG: 5, fatG: 3, carbsG: 30 }] })] }));
  assert.deepEqual(context.nutrition.totals, { calories: 300, proteinG: 15, fatG: 8, carbsG: 50 });
  assert.ok(Object.values(context.nutrition.complete).every(Boolean));
});

test("partial item nutrition is incomplete even when a scalar total exists", () => {
  const context = buildRecommendationContext(input({ meals: [meal({ calories: 200, proteinG: 30,
    items: [{ id: "food-a", name: "Synthetic A", calories: 200, proteinG: 30 }, { id: "food-b", name: "Synthetic B" }] })] }));
  assert.equal(context.nutrition.totals.calories, 200);
  assert.equal(context.nutrition.totals.proteinG, 30);
  assert.equal(context.nutrition.complete.calories, false);
  assert.equal(context.nutrition.complete.proteinG, false);
  assert.equal(context.nutrition.totals.carbsG, null);
});

test("negative, nonnumeric, infinite and unreasonable values remain unknown", () => {
  const context = buildRecommendationContext(input({ meals: [meal({ calories: -1, proteinG: NaN, fatG: Infinity, carbsG: "20" }), meal({ id: "b", calories: 10001 })] }));
  assert.ok(Object.values(context.nutrition.totals).every((value) => value === null));
  assert.ok(Object.values(context.nutrition.complete).every((value) => value === false));
});

test("future and old meals do not become today's intake", () => {
  const context = buildRecommendationContext(input({ meals: [meal({ calories: 200 }), meal({ id: "future", recordedAt: "2026-11-05", calories: 400 }), meal({ id: "past", recordedAt: "2026-11-03", calories: 100 })] }));
  assert.equal(context.nutrition.mealCount, 1);
  assert.equal(context.nutrition.totals.calories, 200);
});

test("date is deterministic and invalid dates are rejected", () => {
  const data = input({ workouts: [workout("自重スクワット", "2026-11-03"), workout("プッシュアップ", "2026-11-05")] });
  assert.deepEqual(buildRecommendationContext(data), buildRecommendationContext(data));
  assert.equal(buildRecommendationContext(data).recentWorkoutCount, 1);
  for (const date of ["2026-02-30", "2026-13-01", "2026-1-4", "invalid", "2026-11-04T12:00:00Z"]) {
    assert.throws(() => buildRecommendationContext(input({ date })), /invalid_recommendation_date/);
  }
});

test("missing profile/age, excluded ages and professional guidance stop all personalization", () => {
  for (const value of [null, { ...profile, age: undefined }, { ...profile, age: 19 }, { ...profile, age: 79 }, { ...profile, age: NaN }]) {
    assert.equal(buildRecommendationContext(input({ profile: value })).candidates.length, 0);
  }
  const context = buildRecommendationContext(input({ constraints: { ...constraints, professionalGuidance: true } }));
  assert.equal(context.candidates.length, 0);
  assert.deepEqual(recommendLocally(context).mealIds, []);
  assert.deepEqual(recommendLocally(context).workoutIds, []);
  assert.ok(buildRecommendationContext(input({ profile: { ...profile, age: 20 } })).candidates.length > 0);
  assert.ok(buildRecommendationContext(input({ profile: { ...profile, age: 78 } })).candidates.length > 0);
});

test("dietary restrictions suppress meals without claiming allergy safety", () => {
  const context = buildRecommendationContext(input({ constraints: { ...constraints, dietaryRestriction: true } }));
  assert.equal(ofKind(context, "meal").length, 0);
  assert.ok(ofKind(context, "workout").length > 0);
  assert.ok(context.notices.some((notice) => notice.includes("交差接触")));
});

test("pain and tiredness each suppress exercise and give a rest notice", () => {
  for (const flag of ["pain", "tired"]) {
    const context = buildRecommendationContext(input({ constraints: { ...constraints, [flag]: true } }));
    assert.equal(ofKind(context, "workout").length, 0);
    assert.ok(ofKind(context, "meal").length > 0);
    assert.ok(context.notices.some((notice) => notice.includes("休息")));
  }
});

test("rest days and selected split categories are respected", () => {
  const splitPlan = { kind: "custom", trainingDays: [1, 3], anchorDate: "2026-11-02", customByWeekday: { 1: ["胸"], 3: ["脚"] } };
  const settings = { ...preferences, splitPlan };
  assert.equal(ofKind(buildRecommendationContext(input({ preferences: settings, date: "2026-11-03" })), "workout").length, 0);
  assert.deepEqual(ofKind(buildRecommendationContext(input({ preferences: settings })), "workout").map((candidate) => candidate.id), ["exercise_bodyweight_squat"]);
  assert.equal(ofKind(buildRecommendationContext(input({ preferences: { ...settings, splitPlan: { ...splitPlan, anchorDate: "bad" } } })), "workout").length, 0);
});

test("only existing favorites with every explicitly registered required equipment qualify", () => {
  const favorites = ["バーベルベンチプレス", "サイドレイズ", "キックバック", "未審査デッドリフト", "自重スクワット"];
  const getIds = (equipment) => ofKind(buildRecommendationContext(input({ preferences: { ...preferences, favoriteExercises: favorites, facilityEquipment: equipment } })), "workout").map((candidate) => candidate.id);
  assert.deepEqual(getIds([]), ["exercise_bodyweight_squat"]);
  assert.deepEqual(getIds(["ダンベル"]), ["exercise_lateral_raise", "exercise_bodyweight_squat"]);
  assert.ok(!getIds(["バーベル"]).includes("exercise_barbell_bench"));
  assert.ok(getIds(["バーベル", "ベンチ"]).includes("exercise_barbell_bench"));
  assert.ok(!getIds(["ダンベルなし", "ベンチなし"]).includes("exercise_kickback"));
  assert.equal(ofKind(buildRecommendationContext(input({ preferences: { ...preferences, favoriteExercises: [] } })), "workout").length, 0);
});

test("unknown machine names are not treated as available equipment", () => {
  const get = (facilityEquipment) => ofKind(buildRecommendationContext(input({ preferences: { ...preferences, favoriteExercises: ["シーテッドロー"], facilityEquipment } })), "workout");
  assert.equal(get([]).length, 0);
  assert.equal(get(["ラットプルダウン"]).length, 0);
  assert.equal(get(["ウェイトマシン"]).length, 1);
  assert.equal(get(["シーテッドロー"]).length, 1);
});

test("only completed sets affect recent history, with future/invalid/old workouts excluded", () => {
  const context = buildRecommendationContext(input({ workouts: [workout("プッシュアップ", "2026-11-03", false), workout("自重スクワット", "2026-11-05"), workout("自重スクワット", "2026-02-30"), workout("自重スクワット", "2026-10-01")] }));
  assert.equal(context.recentWorkoutCount, 0);
  assert.equal(ofKind(context, "workout").length, 3);
});

test("recent completed same-body-part sets are excluded, not automatically progressed", () => {
  const context = buildRecommendationContext(input({ preferences: { ...preferences, favoriteExercises: ["プッシュアップ", "膝つきプッシュアップ", "自重スクワット", "ウォーキング"] }, workouts: [workout("プッシュアップ", "2026-11-03")] }));
  const ids = ofKind(context, "workout").map((candidate) => candidate.id);
  assert.ok(!ids.includes("exercise_pushup"));
  assert.ok(!ids.includes("exercise_knee_pushup"));
  assert.ok(ids.includes("exercise_bodyweight_squat"));
  assert.ok(ids.includes("exercise_walk"));
  assert.ok(ofKind(context, "workout").every((candidate) => candidate.reason.includes("自動増加は行いません")));
});

test("today's same cardio is excluded while yesterday does not exclude all cardio", () => {
  const sameDay = buildRecommendationContext(input({ workouts: [workout("ウォーキング", "2026-11-04")] }));
  const yesterday = buildRecommendationContext(input({ workouts: [workout("ウォーキング", "2026-11-03")] }));
  assert.ok(!ofKind(sameDay, "workout").some((candidate) => candidate.id === "exercise_walk"));
  assert.ok(ofKind(yesterday, "workout").some((candidate) => candidate.id === "exercise_walk"));
});

test("canonical meals derive nutrients from the existing source and serving quantity", () => {
  const foodIds = ["rice", "chicken-breast", "tomatoes"];
  const expected = { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 };
  for (const id of foodIds) {
    const source = library.foods.find((food) => food.id === id);
    for (const key of Object.keys(expected)) expected[key] += source.per100g[key] * source.suggestedGrams / 100;
  }
  expected.calories = Math.round(expected.calories);
  for (const key of ["proteinG", "fatG", "carbsG"]) expected[key] = Math.round(expected[key] * 10) / 10;
  assert.deepEqual(recommendationMeals.find((candidate) => candidate.id === "meal_rice_chicken").nutrition, expected);
  assert.ok(recommendationMeals.every((candidate) => candidate.source.includes(library.version)));
});

test("canonical exercise catalog matches reviewed beginner names, with unique bounded ASCII IDs", () => {
  const names = beginnerExerciseCatalog.flatMap((category) => category.groups.flatMap((group) => group.exercises));
  assert.deepEqual([...recommendationExercises.map((candidate) => candidate.name)].sort(), [...names].sort());
  assert.equal(new Set(recommendationCatalogIds).size, recommendationCatalogIds.length);
  assert.ok(recommendationCatalogIds.every((id) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)));
});

test("six fixed features are bounded and unknown nutrition uses neutral balance features", () => {
  const context = buildRecommendationContext(input());
  assert.equal(featureNames.length, 6);
  assert.ok(context.candidates.every((candidate) => candidate.features.length === 6 && candidate.features.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)));
  assert.ok(ofKind(context, "meal").every((candidate) => candidate.features[1] === 0.5 && candidate.features[2] === 0.5));
});

test("local ranking is deterministic and returns at most three existing IDs of each kind", () => {
  const context = buildRecommendationContext(input());
  const result = recommendLocally(context);
  assert.deepEqual(result, recommendLocally(context));
  assert.equal(result.source, "rules");
  for (const kind of ["meal", "workout"]) {
    assert.ok(result[`${kind}Ids`].length <= 3);
    assert.ok(result[`${kind}Ids`].every((id) => context.candidates.some((candidate) => candidate.id === id && candidate.kind === kind)));
  }
});

test("API request projection never carries profile, date, names, raw text, photos or extra keys", () => {
  const context = buildRecommendationContext(input({ meals: [meal({ calories: 500, proteinG: 20, fatG: 15, carbsG: 60, photoUrl: "https://private.invalid/photo" })] }));
  context.profile = profile;
  context.nutrition.raw = "NEVER SEND RAW";
  context.constraints.extra = "NEVER SEND EXTRA";
  context.candidates[0].private = "NEVER SEND PRIVATE";
  const request = toRecommendationRequest(context);
  assert.deepEqual(Object.keys(request).sort(), ["version", "goal", "nutrition", "recentWorkoutCount", "constraints", "candidates"].sort());
  assert.ok(request.candidates.every((candidate) => Object.keys(candidate).sort().join(",") === "features,id,kind"));
  const encoded = JSON.stringify(request);
  for (const forbidden of ["NEVER SEND", "PRIVATE MEAL TEXT", "2026-11-04", "private@example", "photoUrl", "private.invalid", "title", "reason", "source"]) assert.ok(!encoded.includes(forbidden), forbidden);
  request.candidates[0].features[0] = 0.12345;
  assert.notEqual(context.candidates[0].features[0], 0.12345);
});

test("building/ranking does not mutate caller's profile, records, preferences or constraints", () => {
  const data = input({ meals: [meal({ calories: 500 })], workouts: [workout("プッシュアップ", "2026-11-01")] });
  const before = structuredClone(data);
  const context = buildRecommendationContext(data);
  recommendLocally(context);
  toRecommendationRequest(context);
  assert.deepEqual(data, before);
});
