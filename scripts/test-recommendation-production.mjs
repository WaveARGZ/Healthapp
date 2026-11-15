import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { recommendationMode } from "../lib/recommendations/availability.ts";
import { openRecommendationIdentity } from "../lib/recommendations/firebase-identity.ts";
import { checkProductionRecommendationApi, requestProductionAiRanking, isProductionRecommendationOrigin } from "../lib/recommendations/client.ts";

// Entirely synthetic RAM-only tests: no credentials, records, storage or network.
const origin = "https://healthapp-14a3f.web.app";
const token = "synthetic.jwt.signature";
const requestId = "11111111-1111-4111-8111-111111111111";
const request = { version: "1", goal: "maintain", recentWorkoutCount: 0,
  nutrition: { mealCount: 0, totals: { calories: null, proteinG: null, fatG: null, carbsG: null }, complete: { calories: false, proteinG: false, fatG: false, carbsG: false } },
  constraints: { pain: false, tired: false, dietaryRestriction: false, professionalGuidance: false, availableMinutes: 20 },
  candidates: [{ id: "meal_rice_chicken", kind: "meal", features: [1, 0, 0, 1, 0, 1] }] };
const result = { source: "openai", model: "gpt-5.6-luna", requestId, mealIds: ["meal_rice_chicken"], workoutIds: [] };
const identity = { assertCurrent() {}, async getIdToken() { return token; } };
const input = { origin, identity, requestId, transferConsent: true, request };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

test("test runtime rejects production API destinations even if invoked directly", () => {
  execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { isProductionRecommendationOrigin, checkProductionRecommendationApi } from './lib/recommendations/client.ts';
    assert.equal(isProductionRecommendationOrigin('https://healthapp-14a3f.web.app'), false);
    await assert.rejects(checkProductionRecommendationApi({origin:'https://healthapp-14a3f.web.app',identity:{assertCurrent(){assert.fail('no auth')},getIdToken(){assert.fail('no token')}}},()=>assert.fail('no fetch')), /production_origin_required/);
  `], { cwd: new URL("..", import.meta.url), env: { ...process.env, NEXT_PUBLIC_BODYMAKE_ENV: "test" }, stdio: "pipe" });
});

test("entry, onboarding, settings and recommendations share the same environment gate", () => {
  for (const file of ["dashboard/dashboard-content.tsx", "profile/onboarding-form.tsx", "settings/settings-list.tsx", "recommendations/recommendation-panel.tsx"]) {
    const source = readFileSync(new URL(`../components/${file}`, import.meta.url), "utf8");
    assert.match(source, /recommendationMode\(\{/);
    assert.doesNotMatch(source, /isTestEnvironment && !isSharedTestEnvironment && !isCloudConfigured && !isFirebaseSelected/);
  }
});

test("only production Firebase or isolated local demo may render the feature", () => {
  const env = { test: false, sharedTest: false, cloud: false, firebase: true, firebaseConfigured: true, projectId: "healthapp-14a3f" };
  assert.equal(recommendationMode(env), "firebase");
  for (const overrides of [{ sharedTest: true }, { cloud: true }, { test: true }, { firebaseConfigured: false }, { firebase: false }, { projectId: "other-project" }]) assert.equal(recommendationMode({ ...env, ...overrides }), null);
  assert.equal(recommendationMode({ ...env, test: true, firebase: false }), "local");
});
test("exact production origins only; invalid origin/consent/UUID never requests token or fetch", async () => {
  const deniedIdentity = { assertCurrent: () => assert.fail("no identity access"), getIdToken: () => assert.fail("no token access") };
  for (const bad of ["http://localhost:3001", "https://bodymake-test-14a3f.web.app", `${origin}.evil.invalid`, `${origin}/`, "null"]) {
    assert.equal(isProductionRecommendationOrigin(bad), false);
    await assert.rejects(requestProductionAiRanking({ ...input, origin: bad, identity: deniedIdentity }), /production_origin_required/);
  }
  assert.ok(isProductionRecommendationOrigin("https://healthapp-14a3f.firebaseapp.com"));
  await assert.rejects(requestProductionAiRanking({ ...input, transferConsent: false, identity: deniedIdentity }), /consent_required/);
  await assert.rejects(requestProductionAiRanking({ ...input, requestId: "bad", identity: deniedIdentity }), /invalid_request_id/);
});
test("production readiness sends only auth to fixed Worker; no records, local pairing or AI request", async () => {
  for (const enabled of [false, true]) {
    let calls = 0;
    assert.equal(await checkProductionRecommendationApi({ origin, identity }, async (url, init) => {
      calls++; assert.equal(url, "https://bodymake-recommendation-api.ajimo023.workers.dev/session");
      assert.equal(init.method, "GET"); assert.equal(init.body, undefined);
      assert.equal(init.headers.Authorization, `Bearer ${token}`);
      assert.equal(init.cache, "no-store"); assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error"); assert.equal(init.referrerPolicy, "no-referrer");
      return json({ authorized: true, enabled });
    }), enabled);
    assert.equal(calls, 1);
  }
  for (const bad of [{ enabled: true }, { authorized: false, enabled: true }, { authorized: true, enabled: "true" }]) {
    await assert.rejects(checkProductionRecommendationApi({ origin, identity }, async () => json(bad)), /invalid_response/);
  }
});
test("production inference sends one projected request; ID token is header-only and output is whitelisted", async () => {
  let calls = 0;
  assert.deepEqual(await requestProductionAiRanking(input, async (url, init) => {
    calls++; assert.equal(url, "https://bodymake-recommendation-api.ajimo023.workers.dev/recommend");
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    assert.equal(init.method, "POST"); assert.equal(init.body.includes(token), false);
    assert.deepEqual(JSON.parse(init.body), { requestId, transferConsent: true, request });
    return json({ ...result, raw: "never display" });
  }), result);
  assert.equal(calls, 1);
});
test("token refresh/sign-out/abort errors never submit a paid request", async () => {
  const fail = async () => assert.fail("no fetch");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestProductionAiRanking({ ...input, signal: controller.signal }, fail), /abort/i);
  for (const bad of ["", "synthetic\r\ntoken", "x".repeat(9000)]) await assert.rejects(requestProductionAiRanking({ ...input, identity: { ...identity, getIdToken: async () => bad } }, fail), /invalid_auth_token/);
  await assert.rejects(requestProductionAiRanking({ ...input, identity: { ...identity, getIdToken: async () => { throw new Error("recommendation_auth_changed"); } } }, fail), /auth_changed/);
});
test("a signed-out user or wrong response ID/model never gets a displayed ranking", async () => {
  let current = true;
  await assert.rejects(requestProductionAiRanking({ ...input, identity: { ...identity, assertCurrent() { if (!current) throw new Error("recommendation_auth_changed"); } } }, async () => { current = false; return json(result); }), /auth_changed/);
  for (const overrides of [{ requestId: "wrong" }, { model: "wrong-model" }, { mealIds: ["unknown"] }]) await assert.rejects(requestProductionAiRanking(input, async () => json({ ...result, ...overrides })), /invalid_response/);
});
test("production transport failures, quota and pending gate never retry or fall back", async () => {
  for (const error of ["budget_exhausted", "provider_verification_pending", "auth_unavailable"]) {
    let calls = 0;
    await assert.rejects(requestProductionAiRanking(input, async () => { calls++; return json({ error }, 503); }), new RegExp(error));
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(requestProductionAiRanking(input, async () => { calls++; throw new Error("offline"); }), /offline/);
  assert.equal(calls, 1);
});

function authFixture() {
  const state = { uid: "synthetic-owner", changed: null, invalidations: 0, unsubscribed: 0, tokens: 0, hook: null };
  const user = { uid: state.uid, async getIdToken(force) { assert.equal(force, true); state.tokens++; await state.hook?.(); return token; } };
  const source = { async ready() {}, currentUser() { return state.uid === user.uid ? user : state.uid ? { uid: state.uid } : null; },
    subscribe(changed) { state.changed = changed; changed(state.uid); return () => { state.unsubscribed++; state.changed = null; }; } };
  const change = (uid) => { state.uid = uid; state.changed?.(uid); };
  return { state, source, change, open: () => openRecommendationIdentity(() => state.invalidations++, source) };
}
test("identity starts without fetching tokens; explicit token refresh is RAM-only and disposal revokes access", async () => {
  const { state, open } = authFixture(); const session = await open();
  assert.equal(state.tokens, 0); assert.equal(session.uid, "synthetic-owner");
  assert.equal(await session.getIdToken(), token); assert.equal(state.tokens, 1);
  session.dispose(); session.dispose(); assert.equal(state.unsubscribed, 1);
  assert.throws(() => session.assertCurrent(), /auth_changed/);
});
test("sign-out then sign-back-in does not revive an identity; in-flight refresh also fails closed", async () => {
  for (const next of [null, "synthetic-other"]) {
    const { state, change, open } = authFixture(); const session = await open();
    change(next); change("synthetic-owner");
    assert.equal(state.invalidations, 1);
    await assert.rejects(session.getIdToken(), /auth_changed/); assert.equal(state.tokens, 0); session.dispose();
  }
  const { state, change, open } = authFixture(); const session = await open();
  state.hook = () => { change(null); change("synthetic-owner"); };
  await assert.rejects(session.getIdToken(), /auth_changed/); session.dispose();
});
test("auth is awaited before capturing UID and unauthenticated users cannot open a session", async () => {
  const { state, source, open } = authFixture();
  source.ready = async () => { state.uid = null; };
  await assert.rejects(open(), /auth_required/); assert.equal(state.tokens, 0); assert.equal(state.changed, null);
});
