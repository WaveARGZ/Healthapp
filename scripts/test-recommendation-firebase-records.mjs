import assert from "node:assert/strict";
import test from "node:test";
import { readFirebaseRecommendationRecords } from "../lib/recommendations/firebase-records.ts";
import { buildProfileRecommendationContext } from "../lib/recommendations/profile-context.ts";
import { toRecommendationRequest } from "../lib/recommendations/engine.ts";

// All identities and records are synthetic RAM fixtures. No SDK, network or browser storage access.
const uid = "synthetic-user";
const paths = {
  profile: `users/${uid}/profile/main`, meals: `users/${uid}/meals`,
  workouts: `users/${uid}/workouts`, preferences: `users/${uid}/settings/workout-preferences`,
};
const conditions = { version: "1", pain: false, tired: false, dietaryRestriction: false, professionalGuidance: false, availableMinutes: 30 };
const profile = { id: uid, name: "Synthetic person", age: 30, goal: "maintain", updatedAt: "2026-11-04T00:00:00Z", recommendationPreferences: conditions };
const meal = { id: "synthetic-meal", name: "Synthetic meal", recordedAt: "2026-11-04", mealType: "lunch", createdAt: "2026-11-04T00:00:00Z", calories: 400 };
const workout = { id: "synthetic-workout", performedAt: "2026-11-03", createdAt: "2026-11-03T00:00:00Z", exercises: [{ id: "exercise", name: "プッシュアップ", setRecords: [{ id: "set", completed: true, reps: 8, weightKg: 0 }] }] };
const preferences = { facilityEquipment: [], customEquipment: [], favoriteExercises: ["プッシュアップ", "自重スクワット"] };
const document = (path, data) => ({ path, exists: data !== undefined, ...(data === undefined ? {} : { data: structuredClone(data) }), fromCache: false, hasPendingWrites: false });
const collection = (path, values) => ({ path, documents: values.map((value) => document(`${path}/${value.id}`, value)), fromCache: false, hasPendingWrites: false });

function fixture() {
  const state = {
    uid, calls: [], subscriptions: 0, removals: 0, changed: null, hook: null,
    values: new Map([
      [paths.profile, document(paths.profile, profile)],
      [paths.meals, collection(paths.meals, [meal])],
      [paths.workouts, collection(paths.workouts, [workout])],
      [paths.preferences, document(paths.preferences, preferences)],
    ]),
    setUid(next) { this.uid = next; this.changed?.(next); },
  };
  const read = async (kind, path) => {
    const joined = path.join("/");
    state.calls.push({ kind, path: joined });
    await state.hook?.(joined);
    assert.ok(state.values.has(joined), `Unexpected read: ${joined}`);
    return structuredClone(state.values.get(joined));
  };
  const source = {
    async authStateReady() {}, currentUid: () => state.uid,
    onUidChanged(changed) {
      state.subscriptions += 1; state.changed = changed; changed(state.uid);
      return () => { state.removals += 1; state.changed = null; };
    },
    getDocumentFromServer: (path) => read("document", path),
    getCollectionFromServer: (path) => read("collection", path),
  };
  return { state, source };
}
const expectCode = (promise, code) => assert.rejects(promise, (error) => error.message === code);

test("reads exactly four server-only paths pinned to one signed-in UID and always unsubscribes", async () => {
  const { state, source } = fixture();
  const result = await readFirebaseRecommendationRecords(source);
  assert.deepEqual(result, { profile, meals: [meal], workouts: [workout], preferences });
  assert.deepEqual(state.calls, [
    { kind: "document", path: paths.profile }, { kind: "collection", path: paths.meals },
    { kind: "collection", path: paths.workouts }, { kind: "document", path: paths.preferences },
  ]);
  assert.equal(state.subscriptions, 1); assert.equal(state.removals, 1);
  assert.equal(state.changed, null);
});

test("waits for auth initialization before choosing a UID or starting reads", async () => {
  const { state, source } = fixture();
  let release;
  source.authStateReady = () => new Promise((resolve) => { release = resolve; });
  const pending = readFirebaseRecommendationRecords(source);
  await Promise.resolve();
  assert.equal(state.calls.length, 0); assert.equal(state.subscriptions, 0);
  release(); await pending;
  assert.equal(state.calls.length, 4);
});

test("missing or path-unsafe UID blocks every read", async () => {
  for (const invalid of [null, "", undefined, "../other", "a/b", ".", "..", "a\n", "a".repeat(129)]) {
    const { state, source } = fixture(); state.uid = invalid;
    await expectCode(readFirebaseRecommendationRecords(source), "recommendation_auth_required");
    assert.equal(state.calls.length, 0); assert.equal(state.subscriptions, 0);
  }
});

test("auth initialization, accessor and subscription failures are sanitized and never become anonymous records", async () => {
  for (const field of ["authStateReady", "currentUid", "onUidChanged"]) {
    const { state, source } = fixture();
    source[field] = () => { throw new Error("SYNTHETIC_PRIVATE_SDK_DETAIL"); };
    await expectCode(readFirebaseRecommendationRecords(source), "recommendation_records_unreadable");
    assert.equal(state.calls.length, 0);
  }
});

test("an account change detected while subscribing blocks reads", async () => {
  const { state, source } = fixture();
  source.onUidChanged = (changed) => { changed("synthetic-other-user"); return () => { state.removals += 1; }; };
  await expectCode(readFirebaseRecommendationRecords(source), "recommendation_auth_changed");
  assert.equal(state.calls.length, 0); assert.equal(state.removals, 1);
});

test("sign-out or account change during reads rejects the whole snapshot without crossing paths", async () => {
  for (const next of [null, "synthetic-other-user"]) {
    const { state, source } = fixture();
    state.hook = (path) => { if (path === paths.profile) state.setUid(next); };
    await expectCode(readFirebaseRecommendationRecords(source), "recommendation_auth_changed");
    assert.ok(state.calls.every(({ path }) => path.startsWith(`users/${uid}/`)));
    assert.equal(state.removals, 1);
  }
});

test("an intervening account switch stays invalid even if the original account returns", async () => {
  const { state, source } = fixture();
  state.hook = (path) => { if (path === paths.meals) { state.setUid(null); state.setUid(uid); } };
  await expectCode(readFirebaseRecommendationRecords(source), "recommendation_auth_changed");
  assert.equal(state.removals, 1);
});

test("final currentUid check detects a change even before the observer fires", async () => {
  const { state, source } = fixture();
  state.hook = (path) => { if (path === paths.preferences) state.uid = "synthetic-other-user"; };
  await expectCode(readFirebaseRecommendationRecords(source), "recommendation_auth_changed");
  assert.equal(state.removals, 1);
});

test("any individual read failure rejects the snapshot rather than returning empty or demo histories", async () => {
  for (const failedPath of Object.values(paths)) {
    const { state, source } = fixture();
    state.hook = (path) => { if (path === failedPath) throw new Error("permission denied: SYNTHETIC_PRIVATE"); };
    await expectCode(readFirebaseRecommendationRecords(source), "recommendation_records_unreadable");
    assert.equal(state.removals, 1);
  }
});

test("confirmed missing documents and empty collections remain an explicit new account", async () => {
  const { state, source } = fixture();
  state.values.set(paths.profile, document(paths.profile, undefined));
  state.values.set(paths.preferences, document(paths.preferences, undefined));
  state.values.set(paths.meals, collection(paths.meals, []));
  state.values.set(paths.workouts, collection(paths.workouts, []));
  const result = await readFirebaseRecommendationRecords(source);
  assert.deepEqual(result, { profile: null, meals: [], workouts: [], preferences: { facilityEquipment: [], customEquipment: [], favoriteExercises: [] } });
  assert.throws(() => buildProfileRecommendationContext(result, "2026-11-04"), /recommendation_profile_required/);
});

test("cached, pending or unspecified snapshot metadata is never considered current", async () => {
  for (const path of Object.values(paths)) for (const patch of [{ fromCache: true }, { hasPendingWrites: true }, { fromCache: undefined }, { hasPendingWrites: undefined }]) {
    const { state, source } = fixture(); Object.assign(state.values.get(path), patch);
    await expectCode(readFirebaseRecommendationRecords(source), "recommendation_records_not_current");
    assert.equal(state.removals, 1);
  }
  for (const patch of [{ fromCache: true }, { hasPendingWrites: true }]) {
    const { state, source } = fixture(); Object.assign(state.values.get(paths.meals).documents[0], patch);
    await expectCode(readFirebaseRecommendationRecords(source), "recommendation_records_not_current");
  }
});

test("mismatched document/collection paths and record identity are rejected", async () => {
  const mutations = [
    (state) => { state.values.get(paths.profile).path = `users/other/profile/main`; },
    (state) => { state.values.get(paths.profile).data.id = "other"; },
    (state) => { state.values.get(paths.meals).path = `users/other/meals`; },
    (state) => { state.values.get(paths.meals).documents[0].path = `users/other/meals/synthetic-meal`; },
    (state) => { state.values.get(paths.meals).documents[0].path += "/nested"; },
    (state) => { state.values.get(paths.workouts).documents[0].data.id = "mismatched"; },
  ];
  for (const mutate of mutations) {
    const { state, source } = fixture(); mutate(state);
    await expectCode(readFirebaseRecommendationRecords(source), "recommendation_records_invalid_shape");
  }
});

test("wrong snapshot shapes and contradictory existence do not become defaults", async () => {
  const mutations = [
    (state) => { state.values.set(paths.profile, null); },
    (state) => { state.values.get(paths.profile).exists = false; },
    (state) => { state.values.get(paths.profile).exists = "true"; },
    (state) => { state.values.get(paths.profile).data = null; },
    (state) => { state.values.get(paths.meals).documents = null; },
    (state) => { state.values.get(paths.meals).documents = [null]; },
    (state) => { state.values.get(paths.meals).documents[0].exists = false; },
  ];
  for (const mutate of mutations) {
    const { state, source } = fixture(); mutate(state);
    await expectCode(readFirebaseRecommendationRecords(source), "recommendation_records_invalid_shape");
  }
});

test("existing strict validators reject broken safety flags, nutrition, dates, sets and duplicate histories", async () => {
  const mutations = [
    (state) => { state.values.get(paths.profile).data.recommendationPreferences.pain = "false"; },
    (state) => { state.values.get(paths.profile).data.age = "30"; },
    (state) => { state.values.get(paths.meals).documents[0].data.proteinG = "20"; },
    (state) => { state.values.get(paths.meals).documents[0].data.recordedAt = "2026-02-30"; },
    (state) => { const entries = state.values.get(paths.meals).documents; entries.push(structuredClone(entries[0])); },
    (state) => { state.values.get(paths.workouts).documents[0].data.exercises[0].setRecords[0].completed = "true"; },
  ];
  for (const mutate of mutations) {
    const { state, source } = fixture(); mutate(state);
    await expectCode(readFirebaseRecommendationRecords(source), "recommendation_records_invalid_shape");
  }
});

test("raw equipment and split preferences are validated before any normalization can remove unsafe fields", async () => {
  for (const data of [{ ...preferences, facilityEquipment: [1] }, { ...preferences, favoriteExercises: null },
    { ...preferences, splitPlan: { kind: "unknown", trainingDays: [1], anchorDate: "2026-11-02" } },
    { ...preferences, splitPlan: { kind: "full", trainingDays: [], anchorDate: "2026-11-02" } }]) {
    const { state, source } = fixture(); state.values.set(paths.preferences, document(paths.preferences, data));
    await expectCode(readFirebaseRecommendationRecords(source), "recommendation_records_invalid_shape");
  }
});

test("valid legacy rest days normalize in RAM without changing the server fixture", async () => {
  const { state, source } = fixture();
  const data = { ...preferences, splitPlan: { kind: "five", restDays: [0, 6], anchorDate: "2026-11-02" } };
  state.values.set(paths.preferences, document(paths.preferences, data));
  const before = structuredClone(state.values);
  const result = await readFirebaseRecommendationRecords(source);
  assert.deepEqual(result.preferences.splitPlan.trainingDays, [1, 2, 3, 4, 5]);
  assert.deepEqual(state.values, before);
});

test("missing recommendation conditions remain missing and block personalized context setup", async () => {
  const { state, source } = fixture(); delete state.values.get(paths.profile).data.recommendationPreferences;
  const result = await readFirebaseRecommendationRecords(source);
  assert.equal(result.profile.recommendationPreferences, undefined);
  assert.throws(() => buildProfileRecommendationContext(result, "2026-11-04"), /recommendation_profile_required/);
});

test("partial nutrition remains incomplete and API projection contains no raw identity/photo/record text", async () => {
  const { state, source } = fixture();
  state.values.get(paths.profile).data.email = "synthetic@example.invalid";
  Object.assign(state.values.get(paths.meals).documents[0].data, { photoUrl: "PRIVATE_PHOTO", notes: "PRIVATE_NOTES", items: [{ id: "known", name: "PRIVATE_FOOD", calories: 100 }, { id: "unknown", name: "unknown" }] });
  const records = await readFirebaseRecommendationRecords(source);
  const serialized = JSON.stringify(records);
  assert.ok(!serialized.includes("PRIVATE_PHOTO") && !serialized.includes("PRIVATE_NOTES") && !serialized.includes("@example"));
  const context = buildProfileRecommendationContext(records, "2026-11-04");
  assert.equal(context.nutrition.totals.calories, 100); assert.equal(context.nutrition.complete.calories, false);
  assert.equal(context.nutrition.totals.proteinG, null); assert.equal(context.nutrition.complete.proteinG, false);
  const api = JSON.stringify(toRecommendationRequest(context));
  for (const forbidden of [uid, profile.name, "PRIVATE_FOOD", "2026-11-04", "synthetic-meal", "synthetic-workout"]) assert.ok(!api.includes(forbidden));
});

test("each load fetches new server data and returned snapshots cannot mutate source records", async () => {
  const { state, source } = fixture();
  const first = await readFirebaseRecommendationRecords(source);
  first.profile.recommendationPreferences.pain = true;
  first.workouts[0].exercises[0].setRecords[0].reps = 99;
  assert.equal(state.values.get(paths.profile).data.recommendationPreferences.pain, false);
  assert.equal(state.values.get(paths.workouts).documents[0].data.exercises[0].setRecords[0].reps, 8);
  state.values.get(paths.profile).data.recommendationPreferences.tired = true;
  const second = await readFirebaseRecommendationRecords(source);
  assert.equal(second.profile.recommendationPreferences.tired, true);
  assert.equal(state.calls.length, 8); assert.equal(state.removals, 2);
});

test("no-argument loader refuses server/build-time execution without touching Firebase", async () => {
  assert.equal(typeof window, "undefined");
  await expectCode(readFirebaseRecommendationRecords(), "recommendation_records_unreadable");
});
