import assert from "node:assert/strict";
import test from "node:test";
import { buildProfileRecommendationContext } from "../lib/recommendations/profile-context.ts";
import { toRecommendationRequest } from "../lib/recommendations/engine.ts";

// Pure synthetic RAM fixtures: no localStorage, filesystem writes or external APIs.
const preferences = { version: "1", pain: false, tired: false, dietaryRestriction: false, professionalGuidance: false, availableMinutes: 30 };
const profile = { id: "synthetic", name: "PRIVATE NAME", email: "private@example.invalid", age: 30, goal: "maintain", recommendationPreferences: preferences, updatedAt: "2026-11-04T00:00:00Z" };
const records = { profile, meals: [], workouts: [], preferences: { facilityEquipment: [], customEquipment: [], favoriteExercises: ["自重スクワット", "プッシュアップ", "ウォーキング"] } };
const date = "2026-11-04";
const withConditions = (changes) => ({ ...records, profile: { ...profile, recommendationPreferences: { ...preferences, ...changes } } });
const candidateCount = (context, kind) => context.candidates.filter((candidate) => candidate.kind === kind).length;

test("saved profile conditions populate context without importing their version field", () => {
  const context = buildProfileRecommendationContext(records, date);
  assert.deepEqual(context.constraints, { pain: false, tired: false, dietaryRestriction: false, professionalGuidance: false, availableMinutes: 30 });
  assert.equal(context.date, date);
  assert.ok(candidateCount(context, "meal") > 0);
  assert.ok(candidateCount(context, "workout") > 0);
  assert.equal(Object.hasOwn(context.constraints, "version"), false);
});

test("saved dietary restrictions suppress meal candidates", () => {
  const context = buildProfileRecommendationContext(withConditions({ dietaryRestriction: true }), date);
  assert.equal(candidateCount(context, "meal"), 0);
  assert.ok(candidateCount(context, "workout") > 0);
});

test("saved pain or tiredness each suppress workout candidates", () => {
  for (const flag of ["pain", "tired"]) {
    const context = buildProfileRecommendationContext(withConditions({ [flag]: true }), date);
    assert.equal(candidateCount(context, "workout"), 0);
    assert.ok(candidateCount(context, "meal") > 0);
  }
});

test("saved professional-guidance flag suppresses all personalized candidates", () => {
  const context = buildProfileRecommendationContext(withConditions({ professionalGuidance: true }), date);
  assert.deepEqual(context.candidates, []);
  assert.equal(context.constraints.professionalGuidance, true);
});

test("every supported saved duration is propagated explicitly", () => {
  for (const availableMinutes of [10, 20, 30, 45, 60]) {
    const context = buildProfileRecommendationContext(withConditions({ availableMinutes }), date);
    assert.equal(context.constraints.availableMinutes, availableMinutes);
    assert.equal(toRecommendationRequest(context).constraints.availableMinutes, availableMinutes);
  }
});

test("missing profile or missing/invalid conditions require setup instead of guessing defaults", () => {
  assert.throws(() => buildProfileRecommendationContext({ ...records, profile: null }, date), /recommendation_profile_required/);
  for (const value of [undefined, null, {}, [], false, { ...preferences, pain: "false" }, { ...preferences, version: "2" }, { ...preferences, availableMinutes: 15 }, { ...preferences, transferConsent: true }]) {
    assert.throws(() => buildProfileRecommendationContext({ ...records, profile: { ...profile, recommendationPreferences: value } }, date), /recommendation_profile_required/);
  }
});

test("new profile snapshots replace old safety flags and goal without retaining stale context", () => {
  const first = buildProfileRecommendationContext(records, date);
  const nextRecords = withConditions({ pain: true, dietaryRestriction: true, availableMinutes: 10 });
  nextRecords.profile.goal = "lose-fat";
  const second = buildProfileRecommendationContext(nextRecords, date);
  assert.ok(first.candidates.length > 0);
  assert.deepEqual(second.candidates, []);
  assert.equal(second.goal, "lose-fat");
  assert.equal(second.constraints.availableMinutes, 10);
  assert.equal(first.constraints.pain, false);
  assert.equal(first.goal, "maintain");
});

test("record-side extra constraints cannot override the saved profile", () => {
  const input = { ...withConditions({ pain: true }), constraints: { ...preferences, pain: false }, date: "2099-01-01" };
  const context = buildProfileRecommendationContext(input, date);
  assert.equal(context.constraints.pain, true);
  assert.equal(context.date, date);
  assert.equal(candidateCount(context, "workout"), 0);
});

test("helper neither mutates nor aliases saved preference objects", () => {
  const input = structuredClone(records);
  const before = structuredClone(input);
  const freeze = (value) => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  freeze(input);
  const context = buildProfileRecommendationContext(input, date);
  context.constraints.pain = true;
  context.constraints.availableMinutes = 60;
  assert.deepEqual(input, before);
  assert.equal(input.profile.recommendationPreferences.pain, false);
});

test("API projection excludes raw profile, profile preference version and consent", () => {
  const context = buildProfileRecommendationContext(records, date);
  const request = toRecommendationRequest(context);
  assert.equal(request.version, "1", "API contract version remains required");
  assert.equal(Object.hasOwn(request.constraints, "version"), false);
  assert.deepEqual(Object.keys(request.constraints).sort(), ["pain", "tired", "dietaryRestriction", "professionalGuidance", "availableMinutes"].sort());
  const encoded = JSON.stringify(request);
  for (const forbidden of ["PRIVATE NAME", "private@example.invalid", "recommendationPreferences", "updatedAt", "2026-11-04", "transferConsent", "learningConsent", "profile"]) assert.ok(!encoded.includes(forbidden), forbidden);
});
