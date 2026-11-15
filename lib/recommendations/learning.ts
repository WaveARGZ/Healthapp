import type { RecommendationRanking, RecommendationRequest, RecommendationResult } from "./types.ts";

/** This module has no storage, network or automatic adoption path. All values live in RAM. */
export const RECOMMENDATION_LEARNING_CONSENT = "recommendation-learning-v1" as const;
export const RECOMMENDATION_FEATURE_VERSION = "recommendation-features-v1" as const;
const featureCount = 6;
// Must remain identical to bodymake-safe-rules-v1 in engine.ts; covered by a parity test.
const ruleWeights = [1, 1, 0.5, 0.5, 0.25, 1.5];
export type LearningSource = "app-consent" | "synthetic";
export type LearningSplit = "train" | "validation" | "test";
export interface LearningConsent {
  granted: boolean;
  version: typeof RECOMMENDATION_LEARNING_CONSENT;
  grantedAt: string;
}
interface EventBase { id: string; at: string }
export interface PreferenceEvent extends EventBase {
  type: "preference";
  value: "accepted" | "declined";
  candidateIds: string[];
}
export interface ReviewEvent extends EventBase {
  type: "review";
  decision: "approved" | "rejected";
  /** Supplied by a future authenticated reviewer workflow, never inferred from an API output. */
  reviewer: { id: string; kind: "human" | "visual-agent"; method: "expert-review" | "agent-review" };
  checks: { nutrition: boolean; exercise: boolean; constraints: boolean };
  safeCandidateIds: string[];
  /** A blind, independently produced reference is required for evaluation, not merely another API answer. */
  independent: boolean;
  referenceId?: string;
  correctedRanking?: RecommendationRanking;
}
export interface WithdrawalEvent extends EventBase { type: "withdrawal" }
export type LearningEvent = PreferenceEvent | ReviewEvent | WithdrawalEvent;
export interface LearningExample {
  version: "1";
  id: string;
  source: LearningSource;
  /** Opaque, stable subject/group ID. All contexts from the same person must use the same group. */
  groupId: string;
  groupScope: "session-preview" | "authoritative-subject";
  createdAt: string;
  consent: LearningConsent;
  inputHash: string;
  featureVersion: string;
  promptVersion: string;
  request: RecommendationRequest;
  /** The original API/rule result is never overwritten by feedback or corrected labels. */
  originalResult: RecommendationResult;
  events: LearningEvent[];
}
export interface PendingExampleOptions {
  id: string;
  groupId: string;
  /** Browser-session IDs must remain previews. Authoritative subject grouping belongs to trusted ingestion. */
  groupScope?: "session-preview" | "authoritative-subject";
  source: LearningSource;
  createdAt: string;
  consent: LearningConsent;
  featureVersion: string;
  promptVersion: string;
}
export interface SplitAssignment { source: LearningSource; groupId: string; split: LearningSplit }
export interface LearningDataset {
  source: LearningSource;
  examples: LearningExample[];
  assignments: SplitAssignment[];
  /** Must be refreshed from authoritative withdrawal records before every train/evaluate operation. */
  withdrawnExampleIds: string[];
  withdrawnGroupIds: string[];
}
export interface ExperimentalRanker {
  version: "1";
  status: "experimental-unadopted";
  source: LearningSource;
  featureVersion: string;
  featureCount: number;
  weights: number[];
  trainingExampleIds: string[];
  trainingGroupIds: string[];
  trainingInputHashes: string[];
  teacherModels: string[];
  trainingPairs: number;
}
export interface RankingEvaluation {
  split: "validation" | "test";
  metric: "independent-reference-pairwise-agreement";
  /** Ranking agreement is not evidence of medical benefit or clinical safety. */
  groups: number;
  examples: number;
  pairs: number;
  modelAgreement: number | null;
  ruleAgreement: number | null;
  unsafeRecommendations: number;
}

function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
function opaque(value: string) {
  requireCondition(typeof value === "string" && /^[a-zA-Z0-9:_.-]{1,160}$/.test(value), "invalid_opaque_identifier");
}
function timestamp(value: string) {
  requireCondition(typeof value === "string" && Number.isFinite(Date.parse(value)), "invalid_timestamp");
}
function freezeCopy<T>(value: T): T {
  const copy: T = structuredClone(value);
  function freeze(current: unknown) {
    if (current && typeof current === "object") {
      Object.values(current).forEach(freeze);
      Object.freeze(current);
    }
  }
  freeze(copy);
  return copy;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function exactKeys(value: object, allowed: string[]) {
  requireCondition(Object.keys(value).every((key) => allowed.includes(key)), "unexpected_learning_field");
}
function validateRequest(request: RecommendationRequest) {
  requireCondition(request?.version === "1", "invalid_request_version");
  exactKeys(request, ["version", "goal", "nutrition", "recentWorkoutCount", "constraints", "candidates"]);
  requireCondition(["build-muscle", "lose-fat", "maintain"].includes(request.goal), "invalid_goal");
  requireCondition(Number.isInteger(request.recentWorkoutCount) && request.recentWorkoutCount >= 0, "invalid_workout_count");
  const nutrition = request.nutrition;
  requireCondition(nutrition && Number.isInteger(nutrition.mealCount) && nutrition.mealCount >= 0, "invalid_nutrition");
  exactKeys(nutrition, ["mealCount", "totals", "complete"]);
  const nutrients = ["calories", "proteinG", "fatG", "carbsG"] as const;
  exactKeys(nutrition.totals, [...nutrients]);
  exactKeys(nutrition.complete, [...nutrients]);
  for (const nutrient of nutrients) {
    const value = nutrition.totals[nutrient];
    requireCondition(typeof nutrition.complete[nutrient] === "boolean", "invalid_nutrition");
    requireCondition(value === null || (Number.isFinite(value) && value >= 0), "invalid_nutrition");
    requireCondition(!nutrition.complete[nutrient] || value !== null, "invalid_nutrition");
  }
  requireCondition(request.constraints && typeof request.constraints === "object", "invalid_constraints");
  exactKeys(request.constraints, ["pain", "tired", "dietaryRestriction", "professionalGuidance", "availableMinutes"]);
  for (const key of ["pain", "tired", "dietaryRestriction", "professionalGuidance"] as const) {
    requireCondition(typeof request.constraints[key] === "boolean", "invalid_constraints");
  }
  requireCondition([10, 20, 30, 45, 60].includes(request.constraints.availableMinutes), "invalid_constraints");
  requireCondition(Array.isArray(request.candidates) && request.candidates.length > 0 && request.candidates.length <= 100, "invalid_candidates");
  requireCondition(!request.constraints.professionalGuidance, "professional_guidance_blocks_learning_candidates");
  const ids = new Set<string>();
  const dimension = request.candidates[0]?.features?.length;
  requireCondition(dimension === featureCount, "invalid_features");
  for (const candidate of request.candidates) {
    exactKeys(candidate, ["id", "kind", "features"]);
    opaque(candidate.id);
    requireCondition(!ids.has(candidate.id), "duplicate_candidate");
    ids.add(candidate.id);
    requireCondition(["meal", "workout"].includes(candidate.kind), "invalid_candidate_kind");
    requireCondition(!(candidate.kind === "workout" && (request.constraints.pain || request.constraints.tired)) && !(candidate.kind === "meal" && request.constraints.dietaryRestriction), "candidate_violates_safety_constraints");
    requireCondition(Array.isArray(candidate.features) && candidate.features.length === dimension && candidate.features.every((value) => Number.isFinite(value) && value >= 0 && value <= 1), "invalid_features");
  }
  return dimension;
}
function validateRanking(request: RecommendationRequest, ranking: RecommendationRanking) {
  requireCondition(ranking && Array.isArray(ranking.mealIds) && Array.isArray(ranking.workoutIds), "invalid_ranking");
  const used = new Set<string>();
  for (const [kind, ids] of [["meal", ranking.mealIds], ["workout", ranking.workoutIds]] as const) {
    for (const id of ids) {
      requireCondition(!used.has(id) && request.candidates.some((candidate) => candidate.id === id && candidate.kind === kind), "invalid_candidate_reference");
      used.add(id);
    }
  }
}
export async function hashRecommendationInput(request: RecommendationRequest): Promise<string> {
  validateRequest(request);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(request)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function createPendingExample(requestInput: RecommendationRequest, resultInput: RecommendationResult, optionsInput: PendingExampleOptions): Promise<LearningExample> {
  // Snapshot before the asynchronous digest so edits in the UI cannot race the content hash.
  const request = freezeCopy(requestInput);
  const result = freezeCopy(resultInput);
  const options = freezeCopy(optionsInput);
  validateRequest(request);
  validateRanking(request, result);
  exactKeys(result, ["mealIds", "workoutIds", "source", "model", "requestId"]);
  requireCondition(["openai", "rules", "local-model"].includes(result.source), "invalid_result_source");
  opaque(result.model);
  if (result.requestId !== undefined) opaque(result.requestId);
  [options.id, options.groupId, options.featureVersion, options.promptVersion].forEach(opaque);
  requireCondition(options.featureVersion === RECOMMENDATION_FEATURE_VERSION, "unsupported_feature_version");
  requireCondition(options.groupScope === undefined || ["session-preview", "authoritative-subject"].includes(options.groupScope), "invalid_group_scope");
  requireCondition(["app-consent", "synthetic"].includes(options.source), "invalid_learning_source");
  timestamp(options.createdAt);
  validateConsent(options.consent);
  requireCondition(Date.parse(options.consent.grantedAt) <= Date.parse(options.createdAt), "consent_after_collection");
  // Copy only documented fields. Arbitrary metadata must not introduce names, email addresses or raw records.
  return freezeCopy({
    version: "1", id: options.id, groupId: options.groupId, groupScope: options.groupScope ?? "session-preview", source: options.source, createdAt: options.createdAt,
    consent: options.consent, featureVersion: options.featureVersion, promptVersion: options.promptVersion,
    inputHash: await hashRecommendationInput(request), request, originalResult: result, events: [],
  });
}
function validateConsent(consent: LearningConsent) {
  requireCondition(consent?.granted === true && consent.version === RECOMMENDATION_LEARNING_CONSENT, "explicit_learning_consent_required");
  exactKeys(consent, ["granted", "version", "grantedAt"]);
  timestamp(consent.grantedAt);
}
function validateEvent(example: LearningExample, event: LearningEvent) {
  opaque(event.id);
  timestamp(event.at);
  requireCondition(Date.parse(event.at) >= Date.parse(example.createdAt), "event_before_collection");
  if (event.type === "withdrawal") {
    exactKeys(event, ["id", "at", "type"]);
  } else if (event.type === "preference") {
    exactKeys(event, ["id", "at", "type", "value", "candidateIds"]);
    requireCondition(["accepted", "declined"].includes(event.value), "invalid_preference");
    validateIds(example, event.candidateIds);
  } else if (event.type === "review") {
    exactKeys(event, ["id", "at", "type", "decision", "reviewer", "checks", "safeCandidateIds", "independent", "referenceId", "correctedRanking"]);
    requireCondition(["approved", "rejected"].includes(event.decision), "invalid_review");
    opaque(event.reviewer.id);
    exactKeys(event.reviewer, ["id", "kind", "method"]);
    requireCondition((event.reviewer.kind === "human" && event.reviewer.method === "expert-review") || (event.reviewer.kind === "visual-agent" && event.reviewer.method === "agent-review"), "reviewer_attribution_mismatch");
    exactKeys(event.checks, ["nutrition", "exercise", "constraints"]);
    requireCondition(Object.values(event.checks).length === 3 && Object.values(event.checks).every((value) => typeof value === "boolean"), "invalid_safety_checks");
    validateIds(example, event.safeCandidateIds);
    requireCondition(typeof event.independent === "boolean", "invalid_review");
    if (event.referenceId !== undefined) opaque(event.referenceId);
    if (event.correctedRanking) {
      exactKeys(event.correctedRanking, ["mealIds", "workoutIds"]);
      validateRanking(example.request, event.correctedRanking);
    }
    if (event.independent) {
      requireCondition(event.reviewer.kind === "human" && event.referenceId && event.correctedRanking, "independent_expert_reference_required");
    }
  } else {
    throw new Error("invalid_event_type");
  }
}
function validateIds(example: LearningExample, ids: string[]) {
  requireCondition(Array.isArray(ids) && new Set(ids).size === ids.length && ids.every((id) => example.request.candidates.some((candidate) => candidate.id === id)), "invalid_candidate_reference");
}
function appendEvent(example: LearningExample, event: LearningEvent): LearningExample {
  validateEvent(example, event);
  requireCondition(!example.events.some((entry) => entry.id === event.id), "duplicate_event");
  requireCondition(!example.events.some((entry) => entry.type === "withdrawal"), "consent_withdrawn");
  const last = example.events.at(-1);
  requireCondition(!last || Date.parse(event.at) >= Date.parse(last.at), "out_of_order_event");
  return freezeCopy({ ...example, events: [...example.events, event] });
}
export function appendPreference(example: LearningExample, event: Omit<PreferenceEvent, "type">) {
  return appendEvent(example, { ...event, type: "preference" });
}
export function appendReview(example: LearningExample, event: Omit<ReviewEvent, "type">) {
  return appendEvent(example, { ...event, type: "review" });
}
export function withdrawExample(example: LearningExample, event: EventBase) {
  return appendEvent(example, { ...event, type: "withdrawal" });
}
function latestReview(example: LearningExample) {
  return example.events.filter((event): event is ReviewEvent => event.type === "review").at(-1);
}
function withdrawn(example: LearningExample, dataset: LearningDataset) {
  return dataset.withdrawnExampleIds.includes(example.id) || dataset.withdrawnGroupIds.includes(example.groupId) || example.events.some((event) => event.type === "withdrawal");
}
function targetRanking(example: LearningExample): RecommendationRanking {
  return latestReview(example)?.correctedRanking ?? example.originalResult;
}
export function learningEligibility(example: LearningExample, purpose: "training" | "evaluation", dataset: Pick<LearningDataset, "withdrawnExampleIds" | "withdrawnGroupIds"> = { withdrawnExampleIds: [], withdrawnGroupIds: [] }) {
  if (!example.consent.granted || example.consent.version !== RECOMMENDATION_LEARNING_CONSENT) return { eligible: false, reason: "consent_missing" };
  if (withdrawn(example, dataset as LearningDataset)) return { eligible: false, reason: "consent_withdrawn" };
  if (example.groupScope !== "authoritative-subject") return { eligible: false, reason: "authoritative_subject_group_required" };
  if (example.originalResult.source !== "openai") return { eligible: false, reason: "not_api_teacher" };
  const review = latestReview(example);
  if (!review || review.decision !== "approved") return { eligible: false, reason: "review_pending_or_rejected" };
  if (!review.checks.nutrition || !review.checks.exercise || !review.checks.constraints) return { eligible: false, reason: "safety_checks_incomplete" };
  const ranking = targetRanking(example);
  if ([...ranking.mealIds, ...ranking.workoutIds].some((id) => !review.safeCandidateIds.includes(id))) return { eligible: false, reason: "unsafe_reference" };
  if (purpose === "evaluation" && (!review.independent || review.reviewer.kind !== "human" || review.reviewer.method !== "expert-review" || !review.referenceId || !review.correctedRanking)) return { eligible: false, reason: "independent_expert_reference_required" };
  return { eligible: true, reason: "reviewed" };
}
function splitKey(source: LearningSource, groupId: string) { return `${source}:${groupId}`; }
/** Stable hashing is for partitioning only; SHA-256 above verifies request content. */
function defaultSplit(key: string): LearningSplit {
  let hash = 2166136261;
  for (const char of `recommendation-split-v1:${key}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const bucket = hash % 100;
  return bucket < 70 ? "train" : bucket < 85 ? "validation" : "test";
}
export function assignStableSplits(examples: LearningExample[], existing: SplitAssignment[] = []): SplitAssignment[] {
  const assignments = new Map<string, SplitAssignment>();
  for (const assignment of existing) {
    opaque(assignment.groupId);
    requireCondition(["app-consent", "synthetic"].includes(assignment.source) && ["train", "validation", "test"].includes(assignment.split), "invalid_split_assignment");
    const key = splitKey(assignment.source, assignment.groupId);
    requireCondition(!assignments.has(key) || assignments.get(key)?.split === assignment.split, "conflicting_existing_split");
    assignments.set(key, assignment);
  }
  for (const example of examples) {
    const key = splitKey(example.source, example.groupId);
    if (!assignments.has(key)) assignments.set(key, { source: example.source, groupId: example.groupId, split: defaultSplit(key) });
  }
  return freezeCopy([...assignments.values()]);
}
async function validateDataset(dataset: LearningDataset) {
  requireCondition(["app-consent", "synthetic"].includes(dataset.source), "invalid_learning_source");
  requireCondition(Array.isArray(dataset.withdrawnExampleIds) && Array.isArray(dataset.withdrawnGroupIds), "withdrawal_snapshot_required");
  const assignments = assignStableSplits([], dataset.assignments);
  const examples = new Set<string>();
  const hashes = new Set<string>();
  let featureCount: number | undefined;
  let featureVersion: string | undefined;
  for (const example of dataset.examples) {
    exactKeys(example, ["version", "id", "source", "groupId", "groupScope", "createdAt", "consent", "inputHash", "featureVersion", "promptVersion", "request", "originalResult", "events"]);
    exactKeys(example.originalResult, ["mealIds", "workoutIds", "source", "model", "requestId"]);
    requireCondition(example.version === "1", "invalid_example_version");
    [example.id, example.groupId, example.featureVersion, example.promptVersion, example.originalResult.model].forEach(opaque);
    requireCondition(example.featureVersion === RECOMMENDATION_FEATURE_VERSION, "unsupported_feature_version");
    requireCondition(["session-preview", "authoritative-subject"].includes(example.groupScope), "invalid_group_scope");
    timestamp(example.createdAt);
    requireCondition(["openai", "rules", "local-model"].includes(example.originalResult.source), "invalid_result_source");
    requireCondition(example.source === dataset.source, "source_mixing_forbidden");
    requireCondition(!examples.has(example.id), "duplicate_example");
    examples.add(example.id);
    requireCondition(!hashes.has(example.inputHash), "duplicate_input_hash");
    hashes.add(example.inputHash);
    validateConsent(example.consent);
    requireCondition(Date.parse(example.consent.grantedAt) <= Date.parse(example.createdAt), "consent_after_collection");
    validateRanking(example.request, example.originalResult);
    requireCondition(example.inputHash === await hashRecommendationInput(example.request), "input_hash_mismatch");
    const dimension = validateRequest(example.request);
    requireCondition(featureCount === undefined || featureCount === dimension, "feature_dimension_mismatch");
    requireCondition(featureVersion === undefined || featureVersion === example.featureVersion, "feature_version_mismatch");
    featureCount = dimension;
    featureVersion = example.featureVersion;
    const ids = new Set<string>();
    let previousAt = example.createdAt;
    let wasWithdrawn = false;
    for (const event of example.events) {
      validateEvent(example, event);
      requireCondition(!ids.has(event.id), "duplicate_event");
      requireCondition(!wasWithdrawn, "event_after_withdrawal");
      requireCondition(Date.parse(event.at) >= Date.parse(previousAt), "out_of_order_event");
      ids.add(event.id);
      previousAt = event.at;
      wasWithdrawn = event.type === "withdrawal";
    }
    requireCondition(assignments.some((entry) => entry.source === example.source && entry.groupId === example.groupId), "missing_split_assignment");
  }
  return { featureCount: featureCount ?? 0, featureVersion: featureVersion ?? "", assignments };
}
function forSplit(dataset: LearningDataset, split: LearningSplit) {
  return dataset.examples.filter((example) => dataset.assignments.some((entry) => entry.source === example.source && entry.groupId === example.groupId && entry.split === split));
}
function pairs(ranking: RecommendationRanking): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  for (const ids of [ranking.mealIds, ranking.workoutIds]) {
    for (let first = 0; first < ids.length; first++) for (let second = first + 1; second < ids.length; second++) result.push([ids[first], ids[second]]);
  }
  return result;
}
export async function fitExperimentalRanker(dataset: LearningDataset, options: { epochs?: number; learningRate?: number; regularization?: number } = {}): Promise<ExperimentalRanker> {
  const schema = await validateDataset(dataset);
  const rows = forSplit(dataset, "train").filter((example) => learningEligibility(example, "training", dataset).eligible && pairs(targetRanking(example)).length > 0);
  requireCondition(rows.length > 0, "no_reviewed_training_examples");
  const epochs = options.epochs ?? 60;
  const rate = options.learningRate ?? 0.03;
  const regularization = options.regularization ?? 0.001;
  requireCondition(Number.isInteger(epochs) && epochs > 0 && epochs <= 500 && Number.isFinite(rate) && rate > 0 && rate <= 1 && Number.isFinite(regularization) && regularization >= 0 && regularization <= 1, "invalid_training_options");
  const differences: number[][] = [];
  for (const row of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
    const candidates = new Map(row.request.candidates.map((candidate) => [candidate.id, candidate.features]));
    for (const [preferred, other] of pairs(targetRanking(row))) {
      const first = candidates.get(preferred)!;
      const second = candidates.get(other)!;
      differences.push(first.map((value, index) => value - second[index]));
    }
  }
  requireCondition(differences.length > 0, "no_training_pairs");
  const weights = Array<number>(schema.featureCount).fill(0);
  for (let epoch = 0; epoch < epochs; epoch++) for (const difference of differences) {
    const margin = weights.reduce((sum, weight, index) => sum + weight * difference[index], 0);
    const gradient = 1 / (1 + Math.exp(Math.max(-40, Math.min(40, margin))));
    for (let index = 0; index < weights.length; index++) weights[index] += rate * (gradient * difference[index] - regularization * weights[index]);
  }
  requireCondition(weights.every(Number.isFinite), "non_finite_model");
  return freezeCopy({
    version: "1", status: "experimental-unadopted", source: dataset.source, featureVersion: schema.featureVersion,
    featureCount: schema.featureCount, weights, trainingExampleIds: rows.map((row) => row.id),
    trainingGroupIds: [...new Set(rows.map((row) => row.groupId))], trainingInputHashes: rows.map((row) => row.inputHash),
    teacherModels: [...new Set(rows.map((row) => row.originalResult.model))], trainingPairs: differences.length,
  });
}
/** Pure scoring only. This does not install the model or bypass the application's safety filters. */
export function rankWithExperimentalModel(model: ExperimentalRanker, request: RecommendationRequest, featureVersion: string): RecommendationRanking {
  const dimensions = validateRequest(request);
  requireCondition(model.status === "experimental-unadopted" && model.version === "1" && model.featureVersion === featureVersion && model.featureCount === dimensions && model.weights.length === dimensions && model.weights.every(Number.isFinite), "model_feature_mismatch");
  const ranked = [...request.candidates].map((candidate) => ({ ...candidate, score: candidate.features.reduce((sum, value, position) => sum + value * model.weights[position], 0) })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, "en"));
  return { mealIds: ranked.filter((candidate) => candidate.kind === "meal").map((candidate) => candidate.id), workoutIds: ranked.filter((candidate) => candidate.kind === "workout").map((candidate) => candidate.id) };
}
export async function evaluateExperimentalRanker(model: ExperimentalRanker, dataset: LearningDataset, split: "validation" | "test"): Promise<RankingEvaluation> {
  await validateDataset(dataset);
  requireCondition(model.source === dataset.source, "source_mixing_forbidden");
  requireCondition(!model.trainingExampleIds.some((id) => dataset.withdrawnExampleIds.includes(id)) && !model.trainingGroupIds.some((id) => dataset.withdrawnGroupIds.includes(id)), "model_contains_withdrawn_data");
  for (const example of dataset.examples) {
    if (model.trainingExampleIds.includes(example.id) && withdrawn(example, dataset)) throw new Error("model_contains_withdrawn_data");
  }
  const heldout = forSplit(dataset, split);
  requireCondition(!heldout.some((example) => model.trainingGroupIds.includes(example.groupId) || model.trainingInputHashes.includes(example.inputHash) || model.trainingExampleIds.includes(example.id)), "heldout_training_leak");
  const rows = heldout.filter((example) => learningEligibility(example, "evaluation", dataset).eligible);
  let total = 0, modelCorrect = 0, ruleCorrect = 0, unsafeRecommendations = 0;
  const evaluatedGroups = new Set<string>();
  for (const row of rows) {
    const referencePairs = pairs(targetRanking(row));
    if (referencePairs.length === 0) continue;
    evaluatedGroups.add(row.groupId);
    const prediction = rankWithExperimentalModel(model, row.request, row.featureVersion);
    const ruleCandidates = row.request.candidates.map((candidate) => ({ ...candidate, score: candidate.features.reduce((sum, value, index) => sum + value * ruleWeights[index], 0) })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, "en"));
    const ruleRanking = { mealIds: ruleCandidates.filter((candidate) => candidate.kind === "meal").map((candidate) => candidate.id), workoutIds: ruleCandidates.filter((candidate) => candidate.kind === "workout").map((candidate) => candidate.id) };
    for (const [preferred, other] of referencePairs) {
      const predicted = [...prediction.mealIds, ...prediction.workoutIds];
      const baseline = [...ruleRanking.mealIds, ...ruleRanking.workoutIds];
      modelCorrect += Number(predicted.indexOf(preferred) < predicted.indexOf(other));
      ruleCorrect += Number(baseline.indexOf(preferred) < baseline.indexOf(other));
      total++;
    }
    const safe = latestReview(row)!.safeCandidateIds;
    unsafeRecommendations += [...prediction.mealIds.slice(0, 3), ...prediction.workoutIds.slice(0, 3)].filter((id) => !safe.includes(id)).length;
  }
  return freezeCopy({ split, metric: "independent-reference-pairwise-agreement", groups: evaluatedGroups.size, examples: rows.length, pairs: total, modelAgreement: total ? modelCorrect / total : null, ruleAgreement: total ? ruleCorrect / total : null, unsafeRecommendations });
}
/** Fixed minimums cannot be lowered by callers to make a small dataset pass. Never adopts a model. */
export async function assessExperimentalRanker(model: ExperimentalRanker, dataset: LearningDataset) {
  const validation = await evaluateExperimentalRanker(model, dataset, "validation");
  const test = await evaluateExperimentalRanker(model, dataset, "test");
  const reasons: string[] = [];
  if (model.trainingGroupIds.length < 20) reasons.push("at_least_20_training_groups_required");
  if (validation.groups < 5 || test.groups < 5) reasons.push("at_least_5_independent_groups_per_holdout_required");
  if (validation.unsafeRecommendations || test.unsafeRecommendations) reasons.push("unsafe_recommendation_detected");
  if (validation.modelAgreement === null || validation.ruleAgreement === null || validation.modelAgreement <= validation.ruleAgreement) reasons.push("validation_improvement_not_demonstrated");
  if (test.modelAgreement === null || test.ruleAgreement === null || test.modelAgreement < test.ruleAgreement) reasons.push("independent_test_regression_or_missing");
  return freezeCopy({ readyForManualReview: reasons.length === 0, adopted: false as const, productionChanged: false as const, reasons, validation, test });
}
