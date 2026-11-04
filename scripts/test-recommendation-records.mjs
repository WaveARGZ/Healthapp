import assert from "node:assert/strict";
import test from "node:test";
import { readRecommendationRecords, recommendationStorageKeys } from "../lib/recommendations/records.ts";
import { buildRecommendationContext } from "../lib/recommendations/engine.ts";
import { isRecommendationPreferences } from "../types/recommendation-preferences.ts";

// getItem-only synthetic RAM store: these tests never access browser/disk/user records.
const keys = { profile: "bodymake.profile.v1", meals: "bodymake.meals.v1", workouts: "bodymake.workouts.v1", preferences: "bodymake.workout-preferences.v1" };
const syntheticProfile = { id: "test", name: "Synthetic person", age: 30, goal: "maintain", updatedAt: "2026-11-04T00:00:00Z" };
const syntheticMeal = { id: "meal", name: "Synthetic meal", mealType: "lunch", recordedAt: "2026-11-04", createdAt: "2026-11-04T00:00:00Z" };
const syntheticSet = { id: "set", completed: true, reps: 8, weightKg: 20 };
const syntheticExercise = { id: "exercise", name: "プッシュアップ", setRecords: [syntheticSet] };
const syntheticWorkout = { id: "workout", performedAt: "2026-11-04", createdAt: "2026-11-04T00:00:00Z", exercises: [syntheticExercise] };
const syntheticPreferences = { facilityEquipment: ["ダンベル"], customEquipment: [], favoriteExercises: ["プッシュアップ"] };
const recommendationPreferences = { version: "1", pain: false, tired: false, dietaryRestriction: true, professionalGuidance: false, availableMinutes: 30 };
const defaults = { profile: syntheticProfile, meals: [syntheticMeal], workouts: [syntheticWorkout], preferences: syntheticPreferences };
function store(values = {}) {
  const encoded = new Map(Object.entries(values).map(([key, value]) => [keys[key] ?? key, JSON.stringify(value)]));
  return { getItem: (key) => encoded.get(key) ?? null };
}
function read(values = {}) { return readRecommendationRecords(store({ ...defaults, ...values })); }
function invalid(values) { assert.throws(() => read(values), /recommendation_records_invalid_shape/); }

test("missing keys represent a new account, while only four relevant keys are read", () => {
  const accessed = [];
  assert.deepEqual(readRecommendationRecords({ getItem(key) { accessed.push(key); return null; } }), {
    profile: null, meals: [], workouts: [], preferences: { facilityEquipment: [], customEquipment: [], favoriteExercises: [] },
  });
  assert.deepEqual(new Set(accessed), new Set(recommendationStorageKeys));
  assert.equal(accessed.length, 4);
  assert.ok(accessed.every((key) => !key.includes("photos") && !key.includes("weight")));
});

test("storage access failures propagate as sanitized fixed errors", () => {
  assert.throws(() => readRecommendationRecords({ getItem() { throw new Error("private secret detail"); } }), (error) => error.message === "recommendation_records_unreadable");
});

test("malformed JSON and empty present values never become empty histories", () => {
  for (const key of recommendationStorageKeys) for (const value of ["", "{", "not-json"]) {
    assert.throws(() => readRecommendationRecords({ getItem(requested) { return requested === key ? value : null; } }), /recommendation_records_invalid_json/);
  }
});

test("valid values load without mutating the source and preserve known zero vs unknown", () => {
  const meal = { ...syntheticMeal, calories: 0, proteinG: 0, fatG: 0, items: [{ id: "food", name: "Synthetic food", calories: 0, proteinG: 0 }] };
  const source = { ...defaults, meals: [meal] };
  const before = structuredClone(source);
  const result = read(source);
  assert.deepEqual(result.meals, [meal]);
  assert.equal(result.meals[0].carbsG, undefined);
  result.workouts[0].exercises[0].setRecords[0].reps = 2;
  assert.deepEqual(source, before);
});

test("irrelevant email, photos and arbitrary metadata are not included in returned snapshots", () => {
  const result = read({ profile: { ...syntheticProfile, email: "synthetic@example.invalid", photo: "private-url" },
    meals: [{ ...syntheticMeal, photoUrl: "private-url", notes: "PRIVATE", items: [{ id: "food", name: "food", image: "private-url" }] }],
    workouts: [{ ...syntheticWorkout, notes: "PRIVATE" }], preferences: { ...syntheticPreferences, token: "PRIVATE" } });
  const json = JSON.stringify(result);
  assert.ok(!json.includes("private-url") && !json.includes("PRIVATE") && !json.includes("@example"));
});

test("wrong top-level shapes fail closed", () => {
  for (const bad of [null, {}, "text", 0, true]) {
    invalid({ meals: bad }); invalid({ workouts: bad });
  }
  for (const bad of [null, [], "text", 0, true]) invalid({ preferences: bad });
  for (const bad of [[], "text", 0, true, {}]) invalid({ profile: bad });
  assert.equal(read({ profile: null }).profile, null);
});

test("critical profile age/goal/identity shapes reject malformed values; missing age is retained", () => {
  for (const age of ["30", -1, 22.5, null]) invalid({ profile: { ...syntheticProfile, age } });
  invalid({ profile: { ...syntheticProfile, goal: "anything" } });
  invalid({ profile: { ...syntheticProfile, id: "" } });
  invalid({ profile: { ...syntheticProfile, updatedAt: "not-date" } });
  assert.equal(read({ profile: { ...syntheticProfile, age: undefined } }).profile.age, undefined);
  assert.equal(read({ profile: { ...syntheticProfile, age: 19 } }).profile.age, 19);
});

test("recommendation condition schema accepts only exact versioned booleans and supported minutes", () => {
  for (const availableMinutes of [10, 20, 30, 45, 60]) {
    assert.equal(isRecommendationPreferences({ ...recommendationPreferences, availableMinutes }), true);
  }
  for (const value of [null, undefined, [], {}, "text", 0, true,
    { ...recommendationPreferences, version: 1 }, { ...recommendationPreferences, version: "2" },
    { ...recommendationPreferences, availableMinutes: "30" }, { ...recommendationPreferences, availableMinutes: 15 },
    { ...recommendationPreferences, availableMinutes: NaN }, { ...recommendationPreferences, availableMinutes: Infinity },
    { ...recommendationPreferences, extra: "must not persist" }]) assert.equal(isRecommendationPreferences(value), false);
  for (const key of ["pain", "tired", "dietaryRestriction", "professionalGuidance"]) {
    for (const value of [undefined, null, 0, 1, "false", [], {}]) assert.equal(isRecommendationPreferences({ ...recommendationPreferences, [key]: value }), false);
  }
  for (const key of Object.keys(recommendationPreferences)) {
    const { [key]: omitted, ...remaining } = recommendationPreferences;
    assert.notEqual(omitted, undefined);
    assert.equal(isRecommendationPreferences(remaining), false);
  }
  assert.equal(isRecommendationPreferences(Object.create(recommendationPreferences)), false);
  assert.equal(isRecommendationPreferences({ ...recommendationPreferences, [Symbol("extra")]: true }), false);
});

test("recommendation condition guard is pure and does not add defaults", () => {
  const original = { ...recommendationPreferences };
  const before = structuredClone(original);
  assert.equal(isRecommendationPreferences(Object.freeze(original)), true);
  assert.deepEqual(original, before);
  const missing = {};
  assert.equal(isRecommendationPreferences(missing), false);
  assert.deepEqual(missing, {});
});

test("valid optional recommendation conditions round-trip through profile without mutation", () => {
  const source = { ...syntheticProfile, recommendationPreferences: { ...recommendationPreferences } };
  const before = structuredClone(source);
  const loaded = read({ profile: source });
  assert.deepEqual(loaded.profile.recommendationPreferences, recommendationPreferences);
  loaded.profile.recommendationPreferences.pain = true;
  assert.deepEqual(source, before);
  assert.equal(read({ profile: source }).profile.recommendationPreferences.pain, false);
});

test("older profiles keep recommendation conditions absent instead of assuming all false", () => {
  const result = read({ profile: syntheticProfile });
  assert.equal(result.profile.recommendationPreferences, undefined);
  assert.equal(Object.hasOwn(result.profile, "recommendationPreferences"), false);
});

test("present but malformed recommendation conditions fail closed in strict profile loading", () => {
  for (const value of [null, {}, [], false, "conditions", { ...recommendationPreferences, pain: "false" },
    { ...recommendationPreferences, availableMinutes: 0 }, { ...recommendationPreferences, extra: "PRIVATE" },
    { ...recommendationPreferences, version: "2" }]) invalid({ profile: { ...syntheticProfile, recommendationPreferences: value } });
});

test("wrong record/item shapes, IDs and duplicate records stop recommendations", () => {
  for (const record of [null, {}, "text", [], { ...syntheticMeal, id: "" }, { ...syntheticMeal, mealType: "other" }, { ...syntheticMeal, items: null }, { ...syntheticMeal, items: [null] }]) invalid({ meals: [record] });
  invalid({ meals: [syntheticMeal, syntheticMeal] });
  invalid({ workouts: [syntheticWorkout, syntheticWorkout] });
  const food = { id: "food", name: "Synthetic food" };
  invalid({ meals: [{ ...syntheticMeal, items: [food, food] }] });
});

test("calendar dates and optional local times are checked rather than normalized", () => {
  for (const value of ["2026-02-30", "2026-13-01", "2026-1-01", "bad", null, 42]) {
    invalid({ meals: [{ ...syntheticMeal, recordedAt: value }] });
    invalid({ workouts: [{ ...syntheticWorkout, performedAt: value }] });
  }
  for (const value of ["24:00", "12:60", "2:00", null]) {
    invalid({ meals: [{ ...syntheticMeal, recordedTime: value }] });
    invalid({ workouts: [{ ...syntheticWorkout, performedTime: value }] });
  }
  assert.equal(read({ meals: [{ ...syntheticMeal, recordedTime: "00:00" }] }).meals[0].recordedTime, "00:00");
  assert.equal(read({ workouts: [{ ...syntheticWorkout, performedTime: "23:59" }] }).workouts[0].performedTime, "23:59");
});

test("invalid nutrient types fail closed but per-nutrient missing remains allowed", () => {
  for (const value of ["100", null, -1, {}, []]) for (const nutrient of ["calories", "proteinG", "fatG", "carbsG"]) {
    invalid({ meals: [{ ...syntheticMeal, [nutrient]: value }] });
    invalid({ meals: [{ ...syntheticMeal, items: [{ id: "food", name: "Synthetic", [nutrient]: value }] }] });
  }
  assert.deepEqual(read({ meals: [syntheticMeal] }).meals[0], syntheticMeal);
});

test("completed sets must be booleans and valid count/weight values", () => {
  for (const completed of [undefined, null, 0, "true"]) invalid({ workouts: [{ ...syntheticWorkout, exercises: [{ ...syntheticExercise, setRecords: [{ ...syntheticSet, completed }] }] }] });
  for (const fields of [{ reps: -1 }, { reps: "8" }, { reps: 8.5 }, { weightKg: -1 }, { weightKg: "20" }]) invalid({ workouts: [{ ...syntheticWorkout, exercises: [{ ...syntheticExercise, setRecords: [{ ...syntheticSet, ...fields }] }] }] });
  invalid({ workouts: [{ ...syntheticWorkout, exercises: [{ ...syntheticExercise, setRecords: null }] }] });
  invalid({ workouts: [{ ...syntheticWorkout, exercises: [{ ...syntheticExercise, setRecords: [syntheticSet, syntheticSet] }] }] });
});

test("legacy positive sets/reps and empty new set lists remain compatible", () => {
  const exercise = { id: "legacy", name: "プッシュアップ", reps: 8, sets: 3, weightKg: 0 };
  assert.deepEqual(read({ workouts: [{ ...syntheticWorkout, exercises: [exercise] }] }).workouts[0].exercises, [exercise]);
  assert.deepEqual(read({ workouts: [{ ...syntheticWorkout, exercises: [{ ...syntheticExercise, setRecords: [] }] }] }).workouts[0].exercises[0].setRecords, []);
});

test("malformed preference lists do not silently disappear", () => {
  for (const key of ["facilityEquipment", "customEquipment", "favoriteExercises"]) for (const value of [null, "ダンベル", [1], [""]]) invalid({ preferences: { ...syntheticPreferences, [key]: value } });
  assert.deepEqual(read({ preferences: { favoriteExercises: ["自重スクワット"] } }).preferences, { facilityEquipment: [], customEquipment: [], favoriteExercises: ["自重スクワット"] });
});

test("invalid split schedules never become an unrestricted no-plan day", () => {
  const plan = { kind: "three", trainingDays: [1, 3, 5], anchorDate: "2026-11-02" };
  for (const fields of [{ kind: "unknown" }, { trainingDays: [] }, { trainingDays: [1, 1] }, { trainingDays: [7] }, { trainingDays: ["1"] }, { anchorDate: "2026-02-30" }]) invalid({ preferences: { ...syntheticPreferences, splitPlan: { ...plan, ...fields } } });
  invalid({ preferences: { ...syntheticPreferences, splitPlan: null } });
  assert.deepEqual(read({ preferences: { ...syntheticPreferences, splitPlan: plan } }).preferences.splitPlan, plan);
});

test("legacy two rest days migrate only in the returned RAM value", () => {
  const plan = { kind: "five", restDays: [0, 6], anchorDate: "2026-11-02" };
  const result = read({ preferences: { ...syntheticPreferences, splitPlan: plan } });
  assert.deepEqual(result.preferences.splitPlan.trainingDays, [1, 2, 3, 4, 5]);
  assert.deepEqual(plan.restDays, [0, 6]);
  assert.equal(plan.trainingDays, undefined);
  invalid({ preferences: { ...syntheticPreferences, splitPlan: { ...plan, restDays: [0] } } });
});

test("custom day/category shapes are strictly validated", () => {
  const plan = { kind: "custom", trainingDays: [1, 3], anchorDate: "2026-11-02", customByWeekday: { 1: ["胸"], 3: [] } };
  assert.deepEqual(read({ preferences: { ...syntheticPreferences, splitPlan: plan } }).preferences.splitPlan, plan);
  for (const customByWeekday of [null, [], { 7: ["胸"] }, { 1: ["不明"] }, { 1: ["胸", "胸"] }, { 1: "胸" }]) invalid({ preferences: { ...syntheticPreferences, splitPlan: { ...plan, customByWeekday } } });
});

test("strict loader and engine preserve partial nutrition and completed-workout safeguards together", () => {
  const records = read({ meals: [{ ...syntheticMeal, calories: 500, items: [{ id: "food", name: "Synthetic", calories: 100 }, { id: "unknown", name: "Unknown" }] }] });
  const context = buildRecommendationContext({ ...records, date: "2026-11-04", constraints: { pain: false, tired: false, dietaryRestriction: false, professionalGuidance: false, availableMinutes: 30 } });
  assert.equal(context.nutrition.totals.calories, 100);
  assert.equal(context.nutrition.complete.calories, false);
  assert.equal(context.recentWorkoutCount, 1);
  assert.ok(!context.candidates.some((candidate) => candidate.id === "exercise_pushup"));
});
