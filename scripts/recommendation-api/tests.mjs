import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { createRecommendationServer, readGatewayConfig, validateRequest } from "./server.ts";
import { createOpenAIProvider, RecommendationApiError, validateRanking } from "./provider.ts";
import { buildRecommendationContext, toRecommendationRequest } from "../../lib/recommendations/engine.ts";

const ORIGIN = "http://localhost:3001";
const fakeEnvironment = () => ({
  BODYMAKE_RECOMMENDATION_API_ENABLED: "true",
  OPENAI_API_KEY: "synthetic-key-never-sent-to-provider",
  OPENAI_RECOMMENDATION_MODEL: "mock-model",
  BODYMAKE_RECOMMENDATION_SESSION_BUDGET_USD: "0.50",
  BODYMAKE_RECOMMENDATION_RESERVE_USD_PER_CALL: "0.05",
});
const fakeConfig = () => readGatewayConfig(fakeEnvironment());
const fixtureRequest = () => ({
  version: "1", goal: "maintain",
  nutrition: { mealCount: 0, totals: { calories: null, proteinG: null, fatG: null, carbsG: null }, complete: { calories: false, proteinG: false, fatG: false, carbsG: false } },
  recentWorkoutCount: 1,
  constraints: { pain: false, tired: false, dietaryRestriction: false, professionalGuidance: false, availableMinutes: 20 },
  candidates: [
    { id: "meal_rice_chicken", kind: "meal", features: [0.5, 0.5, 0.5, 1, 0, 0.5] },
    { id: "exercise_walk", kind: "workout", features: [0.6, 0.5, 0.5, 1, 0.5, 1] },
  ],
});
const envelope = (request = fixtureRequest()) => ({ requestId: randomUUID(), transferConsent: true, request });
const ranking = () => ({ mealIds: ["meal_rice_chicken"], workoutIds: ["exercise_walk"] });

async function start(t, provider = async () => ranking(), config = fakeConfig(), now) {
  const server = createRecommendationServer({ config, provider, now });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const get = (path, headers = {}) => fetch(`${url}${path}`, { headers: { Origin: ORIGIN, ...headers } });
  const session = async (origin = ORIGIN) => {
    const response = await get("/session", { Origin: origin });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  };
  const post = (token, body = envelope(), extra = {}) => fetch(`${url}/recommend`, {
    method: "POST", headers: { Origin: ORIGIN, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra }, body: JSON.stringify(body),
  });
  return { server, url, get, session, post };
}

test("configuration is disabled by default and requires explicit model, key and reservation settings", () => {
  assert.equal(readGatewayConfig({}).enabled, false);
  assert.equal(readGatewayConfig({ BODYMAKE_RECOMMENDATION_API_ENABLED: "true" }).reason, "configuration_required");
  assert.equal(fakeConfig().enabled, true);
  for (const bad of ["NaN", "Infinity", "-1", "1000000", ""]) {
    assert.equal(readGatewayConfig({ ...fakeEnvironment(), BODYMAKE_RECOMMENDATION_MAX_CALLS: bad }).enabled, false);
  }
  for (const key of ["OPENAI_API_KEY", "OPENAI_RECOMMENDATION_MODEL", "BODYMAKE_RECOMMENDATION_SESSION_BUDGET_USD", "BODYMAKE_RECOMMENDATION_RESERVE_USD_PER_CALL"]) {
    const environment = fakeEnvironment(); delete environment[key];
    assert.equal(readGatewayConfig(environment).enabled, false);
  }
  assert.equal(readGatewayConfig({ ...fakeEnvironment(), OPENAI_RECOMMENDATION_MODEL: "https://evil.invalid" }).enabled, false);
  assert.equal(readGatewayConfig({ ...fakeEnvironment(), BODYMAKE_RECOMMENDATION_RESERVE_USD_PER_CALL: "1" }).enabled, false);
});

test("request privacy allowlist rejects names, dates, arbitrary IDs, duplicate IDs and extra nested fields", () => {
  const changes = [
    (body) => { body.name = "synthetic-user"; },
    (body) => { body.request.date = "2026-11-04"; },
    (body) => { body.request.nutrition.email = "fixture@example.invalid"; },
    (body) => { body.request.candidates[0].id = "meal_unknown"; },
    (body) => { body.request.candidates[0].title = "private meal"; },
    (body) => { body.request.candidates.push(body.request.candidates[0]); },
    (body) => { body.request.candidates[0].kind = "workout"; },
    (body) => { body.request.constraints.extra = true; },
    (body) => { body.requestId = "not-a-uuid"; },
    (body) => { body.request.candidates[0].features = Array(7).fill(0.5); },
    (body) => { body.request.candidates[0].features[0] = Infinity; },
    (body) => { body.request.candidates[0].features[0] = -0.1; },
    (body) => { body.request.candidates[0].features[0] = 1.1; },
    (body) => { body.request.goal = "compensate-for-food"; },
    (body) => { body.request.constraints.availableMinutes = "20"; },
  ];
  for (const mutate of changes) {
    const body = envelope(); mutate(body);
    assert.throws(() => validateRequest(body), { code: "invalid_request" });
  }
});

test("consent is mandatory, partial nutrition stays unknown, safety flags cannot reintroduce excluded candidates", () => {
  const body = envelope(); body.transferConsent = false;
  assert.throws(() => validateRequest(body), { code: "consent_required" });
  const partial = envelope();
  partial.request.nutrition.mealCount = 2;
  partial.request.nutrition.totals.calories = 400;
  assert.equal(validateRequest(partial).request.nutrition.complete.calories, false);
  partial.request.nutrition.complete.proteinG = true;
  assert.throws(() => validateRequest(partial), { code: "invalid_request" });
  for (const flag of ["pain", "tired", "dietaryRestriction", "professionalGuidance"]) {
    const input = envelope(); input.request.constraints[flag] = true;
    assert.throws(() => validateRequest(input), { code: "unsafe_candidates" });
  }
});

test("engine projection is accepted by the gateway, including incomplete recorded nutrition", () => {
  const context = buildRecommendationContext({
    profile: { age: 30, goal: "maintain" },
    meals: [{ recordedAt: "2026-11-04", name: "synthetic-only", calories: 400 }],
    workouts: [], preferences: { favoriteExercises: [], facilityEquipment: [], customEquipment: [] }, date: "2026-11-04",
    constraints: fixtureRequest().constraints,
  });
  const request = toRecommendationRequest(context);
  assert.equal(request.nutrition.totals.proteinG, null);
  assert.deepEqual(validateRequest(envelope(request)).request, request);
});

test("disabled gateway never invokes provider and does not disclose secret configuration", async (t) => {
  let calls = 0;
  const config = { ...fakeConfig(), enabled: false, reason: "disabled" };
  const service = await start(t, async () => { calls += 1; return ranking(); }, config);
  const health = await service.get("/health");
  const text = await health.text();
  assert.ok(!text.includes(config.apiKey)); assert.ok(!text.includes(config.model));
  assert.equal(JSON.parse(text).enabled, false);
  assert.equal((await service.get("/session")).status, 503);
  assert.equal((await service.post("not-a-token")).status, 503);
  assert.equal(calls, 0);
});

test("all endpoints require exact test Origin, loopback Host and exact path", async (t) => {
  const service = await start(t);
  assert.equal((await fetch(`${service.url}/health`)).status, 403);
  for (const origin of ["https://healthapp-14a3f.web.app", "http://localhost:3000", "http://localhost:3001.evil.invalid", "null"]) {
    const response = await service.get("/health", { Origin: origin });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  // Native fetch replaces Host; use the actual HTTP client to exercise DNS-rebinding protection.
  const hostileHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(`${service.url}/health`, { headers: { Host: "evil.invalid", Origin: ORIGIN } }, (response) => {
      response.resume(); response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject); request.end();
  });
  assert.equal(hostileHostStatus, 403);
  assert.equal((await service.get("/health?token=bad")).status, 404);
  assert.equal((await service.get("/health", { Origin: "http://127.0.0.1:3001" })).status, 200);
});

test("preflight allows only the narrow methods and headers", async (t) => {
  const service = await start(t);
  const good = await fetch(`${service.url}/recommend`, { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
  assert.equal(good.status, 204);
  assert.equal(good.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(good.headers.get("access-control-allow-credentials"), null);
  const bad = await fetch(`${service.url}/recommend`, { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-arbitrary" } });
  assert.equal(bad.status, 403);
});

test("RAM session token is required, origin-bound, reused without extending lifetime, and expires", async (t) => {
  let time = 1000;
  const service = await start(t, undefined, fakeConfig(), () => time);
  assert.equal((await service.post("missing")).status, 401);
  const token = await service.session();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal((await service.post(token, envelope(), { Origin: "http://127.0.0.1:3001" })).status, 401);
  for (let index = 0; index < 6; index++) assert.equal(await service.session(), token);
  assert.notEqual(await service.session("http://127.0.0.1:3001"), token);
  time += 30 * 60 * 1000 + 1;
  assert.equal((await service.post(token)).status, 401);
  assert.notEqual(await service.session(), token);
});

test("JSON size, encoding and consent checks happen before any provider call", async (t) => {
  let calls = 0;
  const service = await start(t, async () => { calls++; return ranking(); });
  const token = await service.session();
  assert.equal((await service.post(token, envelope(), { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await service.post(token, envelope(), { "Content-Encoding": "gzip" })).status, 415);
  assert.equal((await service.post(token, { ...envelope(), transferConsent: false })).status, 403);
  assert.equal((await service.post(token, { ...envelope(), extra: "x".repeat(20000) })).status, 413);
  assert.equal(calls, 0);
});

test("success returns only validated selection and no user data or key", async (t) => {
  const service = await start(t);
  const token = await service.session();
  const input = envelope();
  const response = await service.post(token, input);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ...ranking(), source: "openai", model: "mock-model", requestId: input.requestId });
});

test("same request ID and content is replayed without another charged call, including across RAM sessions", async (t) => {
  let calls = 0;
  let time = 1000;
  const service = await start(t, async () => { calls++; return ranking(); }, fakeConfig(), () => time);
  const token = await service.session();
  const input = envelope();
  const first = await service.post(token, input);
  const firstBody = await first.json();
  time += 31 * 60 * 1000;
  const freshToken = await service.session();
  assert.notEqual(freshToken, token);
  const again = await service.post(freshToken, input);
  assert.deepEqual(await again.json(), firstBody);
  assert.equal(calls, 1);
  input.request.recentWorkoutCount++;
  assert.equal((await service.post(freshToken, input)).status, 409);
  assert.equal(calls, 1);
});

test("concurrent duplicate shares one call and distinct request cannot bypass reservation/concurrency", async (t) => {
  let calls = 0;
  let release;
  let began;
  const started = new Promise((resolve) => { began = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const service = await start(t, async () => { calls++; began(); await gate; return ranking(); });
  const token = await service.session();
  const input = envelope();
  const first = service.post(token, input);
  await started;
  const duplicate = service.post(token, input);
  const different = await service.post(token);
  assert.equal(different.status, 429);
  assert.equal((await different.json()).error, "request_in_progress");
  release();
  assert.equal((await first).status, 200);
  assert.equal((await duplicate).status, 200);
  assert.equal(calls, 1);
});

test("hard request-count cap is per process, and upstream failure still consumes a reservation", async (t) => {
  let calls = 0;
  const service = await start(t, async () => { calls++; throw new Error("synthetic private detail"); }, { ...fakeConfig(), maxCalls: 1 });
  const token = await service.session();
  const input = envelope();
  const failed = await service.post(token, input);
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), { error: "provider_failed" });
  assert.equal((await service.post(token, input)).status, 502);
  assert.equal((await service.post(token)).status, 429);
  assert.equal(calls, 1);
  assert.equal((await (await service.get("/health")).json()).reservedBudgetUsd, 0.05);
});

test("budget reservation refuses a next call without pretending to verify actual provider spend", async (t) => {
  let calls = 0;
  const service = await start(t, async () => { calls++; return ranking(); }, { ...fakeConfig(), sessionBudgetUsd: 0.05 });
  const token = await service.session();
  assert.equal((await service.post(token)).status, 200);
  const stopped = await service.post(token);
  assert.equal(stopped.status, 429);
  assert.deepEqual(await stopped.json(), { error: "session_budget_reached" });
  assert.equal(calls, 1);
});

test("gateway revalidates even injected provider output", async (t) => {
  const service = await start(t, async () => ({ mealIds: ["meal_not_in_request"], workoutIds: [] }));
  const result = await service.post(await service.session());
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(), { error: "provider_bad_output" });
});

const providerResponse = (text = JSON.stringify(ranking())) => ({ status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text }] }] });

test("Responses wire format uses strict schema, store:false, fixed endpoint and bounded output, with no tools or retries", async () => {
  let calls = 0;
  const config = fakeConfig();
  const provider = createOpenAIProvider(config, async (url, options) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options.redirect, "error");
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.model, "mock-model");
    assert.equal(body.max_output_tokens, 400);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    assert.deepEqual(body.text.format.schema.properties.mealIds.items.enum, ["meal_rice_chicken"]);
    assert.equal(body.tools, undefined);
    assert.equal(body.conversation, undefined);
    assert.equal(body.previous_response_id, undefined);
    assert.deepEqual(JSON.parse(body.input[0].content[0].text), fixtureRequest());
    assert.ok(!options.body.includes(config.apiKey));
    return Response.json(providerResponse());
  });
  assert.deepEqual(await provider(fixtureRequest()), ranking());
  assert.equal(calls, 1);
});

test("production provider pins default tier and non-reasoning effort, and checks cost metadata", async () => {
  const config = { ...fakeConfig(), model: "gpt-5.6-luna", serviceTier: "default", reasoningEffort: "none", maximumInputTokens: 922000 };
  const valid = () => ({ ...providerResponse(), model: config.model, service_tier: "default",
    usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130 } });
  let calls = 0;
  const provider = createOpenAIProvider(config, async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.service_tier, "default");
    assert.deepEqual(body.reasoning, { effort: "none" });
    assert.equal(body.max_output_tokens, 400);
    return Response.json(valid());
  });
  assert.deepEqual(await provider(fixtureRequest()), ranking());
  assert.equal(calls, 1);
  for (const mutate of [
    (body) => { body.model = "unexpected-model"; },
    (body) => { body.service_tier = "priority"; },
    (body) => { delete body.usage; },
    (body) => { body.usage.input_tokens = 922001; },
    (body) => { body.usage.output_tokens = 401; },
    (body) => { body.usage.input_tokens = -1; },
    (body) => { body.usage.total_tokens = 131; },
  ]) {
    const body = valid(); mutate(body);
    await assert.rejects(createOpenAIProvider(config, async () => Response.json(body))(fixtureRequest()), { code: "provider_cost_unconfirmed" });
  }
  let unconfiguredCalls = 0;
  await assert.rejects(createOpenAIProvider({ ...config, maximumInputTokens: undefined }, async () => {
    unconfiguredCalls++; return Response.json(valid());
  })(fixtureRequest()), { code: "pricing_not_verified" });
  assert.equal(unconfiguredCalls, 0);
});

test("strict output validation catches extras, duplicates, cross-kind IDs and invalid JSON", async () => {
  for (const value of [
    { ...ranking(), reason: "unrequested prose" },
    { mealIds: ["meal_rice_chicken", "meal_rice_chicken"], workoutIds: [] },
    { mealIds: ["exercise_walk"], workoutIds: [] },
    { mealIds: ["meal_unknown"], workoutIds: [] },
    { mealIds: "meal_rice_chicken", workoutIds: [] },
  ]) assert.throws(() => validateRanking(value, fixtureRequest()), { code: "provider_bad_output" });
  const invalid = createOpenAIProvider(fakeConfig(), async () => Response.json(providerResponse("not json")));
  await assert.rejects(invalid(fixtureRequest()), { code: "provider_bad_output" });
});

test("refusal, incomplete, unknown status and tool output are not treated as recommendations", async () => {
  const cases = [
    [{ ...providerResponse(), status: "incomplete" }, "provider_incomplete"],
    [{ ...providerResponse(), status: "queued" }, "provider_incomplete"],
    [{ status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "No" }] }] }, "provider_refusal"],
    [{ status: "completed", output: [{ type: "function_call", arguments: "{}" }] }, "provider_bad_output"],
    [{ status: "completed", output: [] }, "provider_bad_output"],
  ];
  for (const [body, code] of cases) {
    const provider = createOpenAIProvider(fakeConfig(), async () => Response.json(body));
    await assert.rejects(provider(fixtureRequest()), { code });
  }
});

test("HTTP failure and timeout have stable errors, no automatic retries or raw upstream errors", async () => {
  let calls = 0;
  const failure = createOpenAIProvider(fakeConfig(), async () => { calls++; return new Response("private-provider-error", { status: 429 }); });
  await assert.rejects(failure(fixtureRequest()), { code: "provider_failed" });
  assert.equal(calls, 1);
  const timeout = createOpenAIProvider({ ...fakeConfig(), timeoutMs: 5 }, async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("private abort detail")), { once: true });
  }));
  await assert.rejects(timeout(fixtureRequest()), { code: "provider_timeout", status: 504 });
});

test("oversized upstream response is rejected without unlimited buffering", async () => {
  const provider = createOpenAIProvider(fakeConfig(), async () => new Response("x".repeat(70_000)));
  await assert.rejects(provider(fixtureRequest()), { code: "provider_bad_output" });
});

test("safe refusal errors survive gateway without creating training examples", async (t) => {
  const service = await start(t, async () => { throw new RecommendationApiError("provider_refusal"); });
  const result = await service.post(await service.session());
  assert.deepEqual(await result.json(), { error: "provider_refusal" });
});
