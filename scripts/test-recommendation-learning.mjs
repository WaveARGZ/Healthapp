import assert from "node:assert/strict";
import test from "node:test";
import { recommendLocally } from "../lib/recommendations/engine.ts";
import {
  RECOMMENDATION_LEARNING_CONSENT,
  appendPreference,
  appendReview,
  assessExperimentalRanker,
  assignStableSplits,
  createPendingExample,
  evaluateExperimentalRanker,
  fitExperimentalRanker,
  hashRecommendationInput,
  learningEligibility,
  rankWithExperimentalModel,
  withdrawExample,
} from "../lib/recommendations/learning.ts";

// Synthetic in-memory fixtures only. No API, real records, files, model exports or caches.
const time = "2026-11-04T03:00:00.000Z";
const later = "2026-11-04T03:01:00.000Z";
const stillLater = "2026-11-04T03:02:00.000Z";
const consent = { granted: true, version: RECOMMENDATION_LEARNING_CONSENT, grantedAt: time };
const ranking = { mealIds: ["meal:c", "meal:b", "meal:a"], workoutIds: ["workout:c", "workout:b", "workout:a"] };
function request(index = 0) {
  return {
    version: "1", goal: "build-muscle",
    nutrition: { mealCount: 1, totals: { calories: 500 + index, proteinG: 20, fatG: 15, carbsG: 65 }, complete: { calories: true, proteinG: true, fatG: true, carbsG: true } },
    recentWorkoutCount: 2,
    constraints: { pain: false, tired: false, dietaryRestriction: false, professionalGuidance: false, availableMinutes: 30 },
    candidates: ["meal", "workout"].flatMap((kind) => ["a", "b", "c"].map((letter, value) => ({ id: `${kind}:${letter}`, kind, features: [value / 2, 0.5, 0.5, 1, 0.5, 1 - value / 2] }))),
  };
}
async function pending(index = 0, overrides = {}, resultOverrides = {}) {
  return createPendingExample(request(index), { ...ranking, source: "openai", model: "gpt-6.1-terra", requestId: `response-${index}`, ...resultOverrides }, {
    id: `example-${index}`, groupId: `subject-${index}`, groupScope: "authoritative-subject", source: "synthetic", createdAt: time,
    consent, featureVersion: "recommendation-features-v1", promptVersion: "recommendation-prompt-v1", ...overrides,
  });
}
function review(example, independent = false, overrides = {}) {
  return appendReview(example, {
    id: `review-${example.id}`, at: later, decision: "approved",
    reviewer: independent ? { id: "fixture-expert", kind: "human", method: "expert-review" } : { id: "fixture-agent", kind: "visual-agent", method: "agent-review" },
    checks: { nutrition: true, exercise: true, constraints: true },
    safeCandidateIds: example.request.candidates.map((candidate) => candidate.id), independent,
    ...(independent ? { referenceId: `blind-fixture-${example.id}`, correctedRanking: ranking } : {}), ...overrides,
  });
}
async function dataset({ train = 20, validation = 5, test: testCount = 5, independent = true } = {}) {
  const examples = [], assignments = [];
  let index = 0;
  for (const [split, count] of [["train", train], ["validation", validation], ["test", testCount]]) {
    for (let item = 0; item < count; item++, index++) {
      const example = review(await pending(index), split !== "train" && independent);
      examples.push(example);
      assignments.push({ source: "synthetic", groupId: example.groupId, split });
    }
  }
  return { source: "synthetic", examples, assignments, withdrawnExampleIds: [], withdrawnGroupIds: [] };
}

test("pending records preserve original teacher provenance, are immutable, and cannot train", async () => {
  const originalRequest = request();
  const teacher = { ...ranking, source: "openai", model: "gpt-6.1-terra" };
  const example = await createPendingExample(originalRequest, teacher, { id: "sample", groupId: "subject", source: "synthetic", createdAt: time, consent, featureVersion: "recommendation-features-v1", promptVersion: "prompt-v1" });
  assert.match(example.inputHash, /^[0-9a-f]{64}$/);
  assert.equal(example.inputHash, await hashRecommendationInput(originalRequest));
  originalRequest.candidates[0].features[0] = 999;
  assert.equal(example.request.candidates[0].features[0], 0);
  assert.throws(() => example.originalResult.mealIds.reverse(), TypeError);
  assert.equal(learningEligibility(example, "training").eligible, false);
  const collection = { source: "synthetic", examples: [example], assignments: [{ source: "synthetic", groupId: "subject", split: "train" }], withdrawnExampleIds: [], withdrawnGroupIds: [] };
  await assert.rejects(fitExperimentalRanker(collection), /no_reviewed_training_examples/);
});

test("a user preference is not a correctness label or an independent review", async () => {
  const example = await pending();
  const preferred = appendPreference(example, { id: "like-1", at: later, value: "accepted", candidateIds: ["meal:c"] });
  assert.equal(example.events.length, 0);
  assert.equal(preferred.events.length, 1);
  assert.deepEqual(preferred.originalResult, example.originalResult);
  assert.equal(learningEligibility(preferred, "training").eligible, false);
  assert.equal(learningEligibility(preferred, "evaluation").eligible, false);
  assert.throws(() => appendPreference(preferred, { id: "like-1", at: later, value: "declined", candidateIds: [] }), /duplicate_event/);
  assert.throws(() => appendPreference(example, { id: "like-2", at: later, value: "accepted", candidateIds: ["not-a-candidate"] }), /invalid_candidate_reference/);
});

test("consent/version and collection timing are explicit, and personal metadata is excluded", async () => {
  await assert.rejects(pending(0, { consent: { ...consent, granted: false } }), /explicit_learning_consent_required/);
  await assert.rejects(pending(0, { consent: { ...consent, version: "old" } }), /explicit_learning_consent_required/);
  await assert.rejects(pending(0, { consent: { ...consent, grantedAt: later } }), /consent_after_collection/);
  await assert.rejects(pending(0, { groupId: "someone@example.com" }), /invalid_opaque_identifier/);
  const unsafeRequest = { ...request(), email: "someone@example.com" };
  await assert.rejects(hashRecommendationInput(unsafeRequest), /unexpected_learning_field/);
});

test("invalid candidate references, duplicate IDs and malformed features fail closed", async () => {
  await assert.rejects(pending(0, {}, { mealIds: ["absent"] }), /invalid_candidate_reference/);
  await assert.rejects(pending(0, {}, { mealIds: ["meal:a", "meal:a"] }), /invalid_candidate_reference/);
  await assert.rejects(pending(0, {}, { mealIds: ["workout:a"] }), /invalid_candidate_reference/);
  for (const invalid of [NaN, Infinity, -0.1, 1.1]) {
    const input = request(); input.candidates[0].features[0] = invalid;
    await assert.rejects(hashRecommendationInput(input), /invalid_features/);
  }
  const input = request(); input.candidates[0].features.pop();
  await assert.rejects(hashRecommendationInput(input), /invalid_features/);
});

test("hard safety exclusions cannot be bypassed by an approving review", async () => {
  for (const constraint of ["pain", "tired", "dietaryRestriction"]) {
    const input = request(); input.constraints[constraint] = true;
    await assert.rejects(hashRecommendationInput(input), /candidate_violates_safety_constraints/);
  }
  const input = request(); input.constraints.professionalGuidance = true;
  await assert.rejects(hashRecommendationInput(input), /professional_guidance_blocks_learning_candidates/);
});

test("reviews retain history and real reviewer kind, and a rejection supersedes approval", async () => {
  const original = await pending();
  const approved = review(original);
  assert.equal(learningEligibility(approved, "training").eligible, true);
  assert.equal(learningEligibility(approved, "evaluation").reason, "independent_expert_reference_required");
  const rejected = review(approved, false, { id: "second-review", at: stillLater, decision: "rejected" });
  assert.equal(rejected.events.length, 2);
  assert.equal(rejected.events[0].decision, "approved");
  assert.equal(learningEligibility(rejected, "training").eligible, false);
  assert.deepEqual(rejected.originalResult, original.originalResult);
  assert.throws(() => review(original, false, { reviewer: { id: "agent", kind: "visual-agent", method: "expert-review" } }), /reviewer_attribution_mismatch/);
  assert.throws(() => review(original, false, { independent: true }), /independent_expert_reference_required/);
  assert.throws(() => review(original, true, { correctedRanking: undefined }), /independent_expert_reference_required/);
});

test("rules and local-model results cannot be silently relabeled API teachers", async () => {
  for (const source of ["rules", "local-model"]) {
    const example = review(await pending(0, {}, { source }));
    assert.equal(learningEligibility(example, "training").reason, "not_api_teacher");
  }
});

test("incomplete safety review and unsafe corrected ranking remain ineligible", async () => {
  const incomplete = review(await pending(), false, { checks: { nutrition: true, exercise: false, constraints: true } });
  assert.equal(learningEligibility(incomplete, "training").reason, "safety_checks_incomplete");
  const unsafe = review(await pending(), true, { safeCandidateIds: ["meal:a", "workout:a"] });
  assert.equal(learningEligibility(unsafe, "evaluation").reason, "unsafe_reference");
});

test("withdrawal is terminal, excludes training, and invalidates models trained on revoked data", async () => {
  const example = review(await pending());
  const revoked = withdrawExample(example, { id: "withdrawal", at: stillLater });
  assert.equal(learningEligibility(revoked, "training").reason, "consent_withdrawn");
  assert.throws(() => appendPreference(revoked, { id: "new-like", at: stillLater, value: "accepted", candidateIds: [] }), /consent_withdrawn/);
  const collection = await dataset();
  const model = await fitExperimentalRanker(collection);
  await assert.rejects(evaluateExperimentalRanker(model, { ...collection, withdrawnGroupIds: [model.trainingGroupIds[0]] }, "test"), /model_contains_withdrawn_data/);
  const withoutRevoked = await fitExperimentalRanker({ ...collection, withdrawnExampleIds: [collection.examples[0].id] });
  assert.equal(withoutRevoked.trainingExampleIds.includes(collection.examples[0].id), false);
});

test("stable grouped partitions preserve previous test assignments and do not depend on input order", async () => {
  const first = await pending(0, { groupId: "same-subject" });
  const next = await pending(1, { groupId: "same-subject" });
  const other = await pending(2);
  const initial = assignStableSplits([first, other]);
  assert.deepEqual(assignStableSplits([other, next, first], initial), initial);
  const preserved = assignStableSplits([first, next], [{ source: "synthetic", groupId: "same-subject", split: "test" }]);
  assert.deepEqual(preserved, [{ source: "synthetic", groupId: "same-subject", split: "test" }]);
  const sourceSeparated = assignStableSplits([{ ...first, source: "app-consent" }], preserved);
  assert.equal(sourceSeparated.length, 2);
  assert.throws(() => assignStableSplits([], [...preserved, { ...preserved[0], split: "train" }]), /conflicting_existing_split/);
});

test("data source mixing, duplicate context hashes, changed features and missing provenance are rejected", async () => {
  const collection = await dataset();
  await assert.rejects(fitExperimentalRanker({ ...collection, examples: [{ ...collection.examples[0], source: "app-consent" }, ...collection.examples.slice(1)] }), /source_mixing_forbidden/);
  await assert.rejects(fitExperimentalRanker({ ...collection, examples: [...collection.examples, { ...collection.examples[0], id: "duplicate" }] }), /duplicate_input_hash/);
  await assert.rejects(fitExperimentalRanker({ ...collection, examples: [...collection.examples, { ...collection.examples[0], id: "duplicate-context-other-person", groupId: "another-subject" }], assignments: [...collection.assignments, { source: "synthetic", groupId: "another-subject", split: "test" }] }), /duplicate_input_hash/);
  const changed = structuredClone(collection); changed.examples[0].request.candidates[0].features[0] = 1;
  await assert.rejects(fitExperimentalRanker(changed), /input_hash_mismatch/);
  const mixedVersion = structuredClone(collection); mixedVersion.examples[1].featureVersion = "other-version";
  await assert.rejects(fitExperimentalRanker(mixedVersion), /unsupported_feature_version/);
  const missing = structuredClone(collection); missing.examples[0].originalResult.model = "";
  await assert.rejects(fitExperimentalRanker(missing), /invalid_opaque_identifier/);
  await assert.rejects(fitExperimentalRanker({ ...collection, assignments: [] }), /missing_split_assignment/);
});

test("snapshotting prevents asynchronous hashing from retaining a later UI edit", async () => {
  const input = request();
  const future = createPendingExample(input, { ...ranking, source: "openai", model: "gpt-6.1-terra" }, { id: "snapshot", groupId: "snapshot-group", source: "synthetic", createdAt: time, consent, featureVersion: "recommendation-features-v1", promptVersion: "prompt-v1" });
  input.nutrition.totals.calories = 1234;
  const example = await future;
  assert.equal(example.request.nutrition.totals.calories, 500);
  assert.equal(example.inputHash, await hashRecommendationInput(example.request));
});

test("pairwise model fits reviewed training only; independently reviewed validation/test compare rule baseline", async () => {
  const collection = await dataset();
  const model = await fitExperimentalRanker(collection);
  assert.equal(model.status, "experimental-unadopted");
  assert.equal(model.trainingExampleIds.length, 20);
  assert.equal(model.trainingPairs, 120);
  assert.deepEqual(rankWithExperimentalModel(model, request(100), "recommendation-features-v1"), ranking);
  const report = await assessExperimentalRanker(model, collection);
  assert.equal(report.validation.groups, 5);
  assert.equal(report.test.groups, 5);
  assert.equal(report.test.metric, "independent-reference-pairwise-agreement");
  assert.equal(report.validation.ruleAgreement, 0);
  assert.deepEqual(recommendLocally({ ...request(), date: "2026-11-04", notices: [] }).mealIds, [...ranking.mealIds].reverse());
  assert.equal(report.validation.modelAgreement, 1);
  assert.equal(report.test.modelAgreement, 1);
  assert.equal(report.readyForManualReview, true);
  assert.equal(report.adopted, false);
  assert.equal(report.productionChanged, false);
  assert.throws(() => model.weights.push(4), TypeError);
  const changedHoldouts = structuredClone(collection);
  for (const row of changedHoldouts.examples.slice(20)) row.originalResult.mealIds.reverse();
  assert.deepEqual(await fitExperimentalRanker(changedHoldouts), model);
});

test("browser-session grouping remains preview-only even after a review", async () => {
  const example = review(await pending(0, { groupScope: undefined }));
  assert.equal(example.groupScope, "session-preview");
  assert.equal(learningEligibility(example, "training").reason, "authoritative_subject_group_required");
  const collection = { source: "synthetic", examples: [example], assignments: [{ source: "synthetic", groupId: example.groupId, split: "train" }], withdrawnExampleIds: [], withdrawnGroupIds: [] };
  await assert.rejects(fitExperimentalRanker(collection), /no_reviewed_training_examples/);
});

test("teacher-only holdouts cannot produce an evaluation score or pass adoption gates", async () => {
  const collection = await dataset({ independent: false });
  const model = await fitExperimentalRanker(collection);
  const report = await assessExperimentalRanker(model, collection);
  assert.equal(report.validation.pairs, 0);
  assert.equal(report.test.modelAgreement, null);
  assert.equal(report.readyForManualReview, false);
  assert.ok(report.reasons.includes("at_least_5_independent_groups_per_holdout_required"));
});

test("holdout training leakage is rejected, including moving a trained subject into test", async () => {
  const collection = await dataset();
  const model = await fitExperimentalRanker(collection);
  const changed = structuredClone(collection);
  changed.assignments[0].split = "test";
  await assert.rejects(evaluateExperimentalRanker(model, changed, "test"), /heldout_training_leak/);
  const forgedGroup = structuredClone(collection);
  forgedGroup.examples[20].groupId = model.trainingGroupIds[0];
  forgedGroup.assignments.push({ source: "synthetic", groupId: model.trainingGroupIds[0], split: "validation" });
  await assert.rejects(evaluateExperimentalRanker(model, forgedGroup, "validation"), /conflicting_existing_split/);
});

test("insufficient independent group counts and regressions cannot pass the fixed gate", async () => {
  const collection = await dataset({ train: 1, validation: 1, test: 1 });
  const model = await fitExperimentalRanker(collection);
  const report = await assessExperimentalRanker(model, collection);
  assert.equal(report.readyForManualReview, false);
  assert.ok(report.reasons.includes("at_least_20_training_groups_required"));
  const sufficient = await dataset();
  const fullModel = await fitExperimentalRanker(sufficient);
  const regressed = structuredClone(sufficient);
  for (const row of regressed.examples.slice(25)) {
    row.events[0].correctedRanking = { mealIds: [...ranking.mealIds].reverse(), workoutIds: [...ranking.workoutIds].reverse() };
  }
  const failed = await assessExperimentalRanker(fullModel, regressed);
  assert.equal(failed.test.modelAgreement, 0);
  assert.equal(failed.test.ruleAgreement, 1);
  assert.ok(failed.reasons.includes("independent_test_regression_or_missing"));
  assert.equal(failed.adopted, false);
});

test("groups without a training pair cannot inflate the minimum training-group gate", async () => {
  const collection = structuredClone(await dataset());
  for (const row of collection.examples.slice(1, 20)) row.originalResult = { ...row.originalResult, mealIds: ["meal:c"], workoutIds: ["workout:c"] };
  const model = await fitExperimentalRanker(collection);
  assert.equal(model.trainingGroupIds.length, 1);
  assert.equal(model.trainingExampleIds.length, 1);
  const report = await assessExperimentalRanker(model, collection);
  assert.ok(report.reasons.includes("at_least_20_training_groups_required"));
});

test("unsafe top recommendations block review readiness even when pairwise agreement is perfect", async () => {
  const collection = await dataset();
  const model = await fitExperimentalRanker(collection);
  const unsafe = structuredClone(collection);
  for (const row of unsafe.examples.slice(20)) {
    row.events[0].correctedRanking = { mealIds: ["meal:c", "meal:b"], workoutIds: ["workout:c", "workout:b"] };
    row.events[0].safeCandidateIds = ["meal:c", "meal:b", "workout:c", "workout:b"];
  }
  const report = await assessExperimentalRanker(model, unsafe);
  assert.equal(report.test.modelAgreement, 1);
  assert.equal(report.test.unsafeRecommendations, 10);
  assert.ok(report.reasons.includes("unsafe_recommendation_detected"));
  assert.equal(report.readyForManualReview, false);
});
