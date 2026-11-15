import assert from "node:assert/strict";
import test from "node:test";
import { checkRecommendationApi, isLocalRecommendationOrigin, recommendationErrorMessage, requestAiRanking, validateRanking } from "../lib/recommendations/client.ts";

// Synthetic RAM-only requests. Never reads credentials, records, or calls an external API.
const requestId = "11111111-1111-4111-8111-111111111111";
const request = {
  version: "1", goal: "build-muscle", recentWorkoutCount: 0,
  nutrition: { mealCount: 0, totals: { calories: null, proteinG: null, fatG: null, carbsG: null }, complete: { calories: false, proteinG: false, fatG: false, carbsG: false } },
  constraints: { pain: false, tired: false, dietaryRestriction: false, professionalGuidance: false, availableMinutes: 30 },
  candidates: [{ id: "meal_rice_chicken", kind: "meal", features: [1, 0.5, 0.5, 1, 0, 1] }, { id: "exercise_bodyweight_squat", kind: "workout", features: [1, 0, 0, 1, 1, 1] }],
};
const result = { source: "openai", model: "mock-model", requestId, mealIds: ["meal_rice_chicken"], workoutIds: ["exercise_bodyweight_squat"] };
const input = { origin: "http://localhost:3001", transferConsent: true, requestId, request };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("only the two exact local test origins qualify", () => {
  assert.ok(isLocalRecommendationOrigin("http://localhost:3001"));
  assert.ok(isLocalRecommendationOrigin("http://127.0.0.1:3001"));
  for (const origin of ["https://localhost:3001", "http://localhost:3000", "http://localhost:3001.evil.invalid", "null", "https://healthapp-14a3f.web.app", "http://192.168.1.5:3001"]) assert.equal(isLocalRecommendationOrigin(origin), false);
});

test("disabled origin, missing consent, and invalid request IDs perform no fetch", async () => {
  const fetcher = async () => assert.fail("must not send");
  await assert.rejects(requestAiRanking({ ...input, origin: "https://example.invalid" }, fetcher), /local_test_only/);
  await assert.rejects(requestAiRanking({ ...input, transferConsent: false }, fetcher), /consent_required/);
  await assert.rejects(requestAiRanking({ ...input, requestId: "bad" }, fetcher), /invalid_request_id/);
  assert.equal(await checkRecommendationApi("https://example.invalid", undefined, fetcher), false);
});

test("health check is read-only and requires an explicit enabled boolean", async () => {
  for (const value of [false, "true", undefined, true]) {
    const response = await checkRecommendationApi(input.origin, undefined, async (url, init) => {
      assert.equal(url, "http://127.0.0.1:3004/health");
      assert.equal(init.method, undefined);
      assert.equal(init.credentials, "omit");
      assert.equal(init.cache, "no-store");
      assert.equal(init.redirect, "error");
      return json({ enabled: value });
    });
    assert.equal(response, value === true);
  }
});

test("pairing token stays in the header and only the projected request is sent", async () => {
  const calls = [];
  const controller = new AbortController();
  const actual = await requestAiRanking({ ...input, signal: controller.signal }, async (url, init) => {
    calls.push(url);
    assert.equal(init.signal, controller.signal);
    assert.equal(init.credentials, "omit");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    if (url.endsWith("/session")) return json({ token: "synthetic-session" });
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, "Bearer synthetic-session");
    assert.deepEqual(JSON.parse(init.body), { requestId, transferConsent: true, request });
    assert.equal(init.body.includes("synthetic-session"), false);
    return json({ ...result, arbitraryProviderText: "not propagated" });
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(actual, result);
});

test("missing pairing token cannot submit a paid request", async () => {
  let calls = 0;
  await assert.rejects(requestAiRanking(input, async () => { calls++; return json({}); }), /invalid_session/);
  assert.equal(calls, 1);
});

test("malformed, duplicate, cross-kind, and unknown recommendations fail closed", () => {
  for (const bad of [null, {}, { ...result, source: "rules" }, { ...result, model: "" }, { ...result, mealIds: ["unknown"] }, { ...result, mealIds: ["exercise_bodyweight_squat"] }, { ...result, mealIds: ["meal_rice_chicken", "meal_rice_chicken"] }, { ...result, workoutIds: "exercise_bodyweight_squat" }]) {
    assert.throws(() => validateRanking(bad, request), /invalid_response/);
  }
  assert.deepEqual(validateRanking({ ...result, mealIds: [], workoutIds: [] }, request).mealIds, []);
});

test("a response for a different or missing request ID is not displayed", async () => {
  for (const id of [undefined, "22222222-2222-4222-8222-222222222222"]) {
    await assert.rejects(requestAiRanking(input, async (url) => url.endsWith("/session") ? json({ token: "synthetic" }) : json({ ...result, requestId: id })), /invalid_response/);
  }
});

test("unknown outcomes never trigger automatic retries", async () => {
  let calls = 0;
  await assert.rejects(requestAiRanking(input, async (url) => {
    calls++;
    if (url.endsWith("/session")) return json({ token: "synthetic" });
    throw new Error("connection lost");
  }), /connection lost/);
  assert.equal(calls, 2);
});

test("provider text and credentials are never surfaced as user-facing errors", async () => {
  await assert.rejects(requestAiRanking(input, async () => json({ error: "unsafe text secret@example.invalid" }, 500)), /^Error: gateway_error$/);
  const message = recommendationErrorMessage(new Error("arbitrary provider key"));
  assert.equal(message.includes("arbitrary"), false);
  assert.match(message, /自動再送はしていません/);
  assert.match(recommendationErrorMessage(new Error("budget_exhausted")), /上限/);
  assert.match(recommendationErrorMessage(new Error("provider_bad_output")), /採用しません/);
});
