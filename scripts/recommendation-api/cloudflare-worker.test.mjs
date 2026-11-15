import assert from "node:assert/strict";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import worker, { BodyMakeRecommendationBudget, GLOBAL_RECOMMENDATION_BUDGET_NAME } from "./cloudflare-worker.ts";
import { initializeCloudflareBudgetStore, beginCloudflareProviderCall, createCloudflareBudgetStore } from "./cloudflare-budget-store.ts";
import { reserveCumulativeBudget } from "./cumulative-budget.ts";
import { RecommendationApiError } from "./provider.ts";
import { FirebaseAuthError } from "./firebase-auth.ts";

const ORIGIN = "https://healthapp-14a3f.web.app";
const OWNER = "synthetic-owner-only";
const ADMIN = "c".repeat(64);
const META = "bodymake_recommendation_budget_meta";
const RESERVATIONS = "bodymake_recommendation_budget_reservations";
const ATTEMPTS = "bodymake_recommendation_provider_attempts";
const COMPLETIONS = "bodymake_recommendation_provider_completions";
const env = () => ({ BODYMAKE_RECOMMENDATION_API_ENABLED: "true", BODYMAKE_PRICING_VERIFIED_AT: new Date().toISOString(), OPENAI_API_KEY: "synthetic-openai-key-never-sent", OWNER_UID: OWNER, FIREBASE_WEB_API_KEY: "synthetic-firebase-web-api-key", SUBJECT_HMAC_KEY: "d".repeat(64), INITIALIZE_SECRET: ADMIN });
const fixture = () => ({ requestId: randomUUID(), transferConsent: true, request: {
  version: "1", goal: "maintain", nutrition: { mealCount: 0, totals: { calories: null, proteinG: null, fatG: null, carbsG: null }, complete: { calories: false, proteinG: false, fatG: false, carbsG: false } }, recentWorkoutCount: 0,
  constraints: { pain: false, tired: false, dietaryRestriction: false, professionalGuidance: false, availableMinutes: 20 },
  candidates: [{ id: "meal_rice_chicken", kind: "meal", features: [0.5, 0.5, 0.5, 1, 0, 0.5] }],
} });
const ranking = () => ({ mealIds: ["meal_rice_chicken"], workoutIds: [] });
function request(path = "/recommend", body = fixture(), overrides = {}) {
  return new Request(`https://synthetic-worker.example${path}`, { method: path === "/health" || path === "/admin/budget" ? "GET" : "POST", headers: { Origin: ORIGIN, Authorization: "Bearer synthetic-owner-token", "Content-Type": "application/json" }, body: path === "/health" || path === "/admin/budget" ? undefined : JSON.stringify(body), ...overrides });
}
async function error(response, code, status) { assert.equal(response.status, status); assert.deepEqual(await response.json(), { error: code }); }

class MemoryStorage {
  constructor(t) {
    this.db = new DatabaseSync(":memory:"); this.db.exec("PRAGMA temp_store = MEMORY");
    t.after(() => this.db.close());
    this.fail = false; this.failSync = false; this.syncBarrier = null; this.syncCount = 0; this.failQuery = null;
    this.sql = { exec: (query, ...bindings) => {
      if (this.fail || this.failQuery?.(query)) throw new Error("synthetic private SQL failure");
      const rows = this.db.prepare(query).all(...bindings); return { toArray: () => rows };
    } };
  }
  transactionSync(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = callback(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  async sync() { this.syncCount += 1; if (this.syncBarrier) await this.syncBarrier; if (this.failSync) throw new Error("synthetic ack failure"); }
  total() { return this.db.prepare(`SELECT reserved_micros FROM ${META}`).get().reserved_micros; }
}
async function setup(t, overrides = {}, dependencies = {}, initialize = true) {
  const storage = new MemoryStorage(t);
  if (initialize) await initializeCloudflareBudgetStore(storage);
  const environment = { ...env(), ...overrides };
  const calls = { auth: 0, provider: 0, names: [] };
  const object = new BodyMakeRecommendationBudget({ storage }, environment, {
    verifyAuthorization: async (header) => { calls.auth += 1; if (header !== "Bearer synthetic-owner-token") throw new FirebaseAuthError("invalid_auth_token"); return { uid: OWNER }; },
    provider: async () => { calls.provider += 1; return ranking(); }, ...dependencies,
  });
  environment.RECOMMENDATION_BUDGET = { idFromName: (name) => { calls.names.push(name); return "one-fixed-id"; }, get: (id) => { assert.equal(id, "one-fixed-id"); return object; } };
  return { storage, environment, object, calls, fetch: (req) => worker.fetch(req, environment) };
}

test("health always advertises preparation/disabled and does not touch auth, store, provider or secrets", async (t) => {
  const service = await setup(t); service.storage.fail = true;
  for (const fetch of [service.fetch, (req) => service.object.fetch(req)]) {
    const res = await fetch(request("/health"));
    assert.equal(res.status, 200); assert.deepEqual(await res.json(), { enabled: false, stage: "preparation" });
  }
  assert.equal(service.calls.auth, 0); assert.equal(service.calls.provider, 0); assert.equal(service.calls.names.length, 0);
});

const sessionRequest = () => new Request("https://synthetic-worker.example/session", { headers: { Origin: ORIGIN, Authorization: "Bearer synthetic-owner-token" } });
test("owner session check works while disabled and never touches store, provider, or reveals token/identity", async (t) => {
  const service = await setup(t, { BODYMAKE_RECOMMENDATION_API_ENABLED: "false" });
  service.storage.fail = true;
  const res = await service.fetch(sessionRequest());
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), { authorized: true, enabled: false });
  assert.equal(service.calls.auth, 1); assert.equal(service.calls.provider, 0);
});
test("enabled readiness checks ledger without reserving, initializing, or calling provider", async (t) => {
  const service = await setup(t);
  const res = await service.fetch(sessionRequest());
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), { authorized: true, enabled: true });
  assert.equal(service.storage.total(), 0); assert.equal(service.calls.provider, 0);
  const missing = await setup(t, {}, {}, false);
  await error(await missing.fetch(sessionRequest()), "budget_uninitialized", 503);
  assert.equal(missing.calls.provider, 0);
});
test("session status rejects nonowners even while disabled and rejects expired pricing/capacity", async (t) => {
  const other = await setup(t, { BODYMAKE_RECOMMENDATION_API_ENABLED: "false" }, { verifyAuthorization: async () => ({ uid: "other" }) });
  await error(await other.fetch(sessionRequest()), "auth_owner_only", 403);
  const expired = await setup(t, { BODYMAKE_PRICING_VERIFIED_AT: "2020-01-01T00:00:00.000Z" });
  await error(await expired.fetch(sessionRequest()), "pricing_verification_expired", 503);
  const full = await setup(t);
  for (let index = 0; index < 10; index++) await full.fetch(request());
  await error(await full.fetch(sessionRequest()), "budget_exhausted", 429);
  assert.equal(full.calls.provider, 10); assert.equal(full.storage.total(), 5_000_000);
});

test("production is disabled by default; missing configuration or pricing never invokes auth/provider", async (t) => {
  for (const key of ["BODYMAKE_RECOMMENDATION_API_ENABLED", "OPENAI_API_KEY", "OWNER_UID", "FIREBASE_WEB_API_KEY", "SUBJECT_HMAC_KEY", "BODYMAKE_PRICING_VERIFIED_AT"]) {
    const service = await setup(t, { [key]: undefined });
    const res = await service.fetch(request());
    assert.equal(res.status, 503); assert.equal(service.calls.auth, 0); assert.equal(service.calls.provider, 0); assert.equal(service.storage.total(), 0);
  }
  for (const timestamp of ["2020-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z", "bad"]) {
    const service = await setup(t, { BODYMAKE_PRICING_VERIFIED_AT: timestamp });
    assert.equal((await service.fetch(request())).status, 503); assert.equal(service.calls.provider, 0);
  }
});

test("both boundaries enforce exact production origins, HTTPS, paths, methods and narrow CORS", async (t) => {
  const service = await setup(t);
  for (const fetch of [service.fetch, (req) => service.object.fetch(req)]) {
    for (const origin of [null, "null", "http://localhost:3001", "https://healthapp-14a3f.web.app.evil.invalid", "https://bodymake-test-14a3f.web.app"]) {
      const headers = new Headers({ "Content-Type": "application/json" }); if (origin !== null) headers.set("Origin", origin);
      const res = await fetch(request("/recommend", fixture(), { headers }));
      assert.equal(res.headers.get("Access-Control-Allow-Origin"), null); await error(res, "origin_not_allowed", 403);
    }
    const insecure = new Request("http://synthetic.example/health", { headers: { Origin: ORIGIN } });
    await error(await fetch(insecure), "https_required", 403);
    await error(await fetch(request("/health?key=never")), "not_found", 404);
    await error(await fetch(request("/recommend", undefined, { method: "PUT", body: "{}" })), "method_not_allowed", 405);
    const other = await fetch(request("/health", undefined, { headers: { Origin: "https://healthapp-14a3f.firebaseapp.com" } }));
    assert.equal(other.status, 200);
  }
  const options = new Request("https://synthetic.example/recommend", { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
  assert.equal((await service.fetch(options)).status, 204);
  options.headers.set("Access-Control-Request-Headers", "x-arbitrary");
  await error(await service.fetch(options), "preflight_not_allowed", 403);
});

test("bounded JSON, UUIDv4, consent, privacy and safety validation stop before auth and reservation", async (t) => {
  const service = await setup(t);
  const invalid = [
    () => ({ ...fixture(), transferConsent: false }),
    () => ({ ...fixture(), requestId: "aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa" }),
    () => ({ ...fixture(), email: "synthetic@example.invalid" }),
    () => { const body = fixture(); body.request.constraints.dietaryRestriction = true; return body; },
  ];
  for (const make of invalid) assert.ok((await service.fetch(request("/recommend", make()))).status >= 400);
  await error(await service.fetch(request("/recommend", undefined, { body: "x".repeat(20_000) })), "request_too_large", 413);
  await error(await service.fetch(request("/recommend", undefined, { body: "{" })), "invalid_json", 400);
  await error(await service.fetch(request("/recommend", undefined, { headers: { Origin: ORIGIN, "Content-Type": "text/plain" } })), "json_required", 415);
  await error(await service.fetch(request("/recommend", undefined, { headers: { Origin: ORIGIN, "Content-Type": "application/json", "Content-Encoding": "gzip" } })), "encoding_not_supported", 415);
  await error(await service.fetch(request("/recommend", undefined, { headers: { Origin: ORIGIN, "Content-Type": "application/json", "Content-Length": "99999" } })), "request_too_large", 413);
  assert.equal(service.calls.auth, 0); assert.equal(service.calls.provider, 0); assert.equal(service.storage.total(), 0);
});

test("successful recommendation uses the fixed global DO, verified owner HMAC, input SHA and one reservation", async (t) => {
  const service = await setup(t);
  const body = fixture();
  const res = await service.fetch(request("/recommend", body));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ...ranking(), source: "openai", model: "gpt-5.6-luna", requestId: body.requestId });
  assert.deepEqual(service.calls.names, [GLOBAL_RECOMMENDATION_BUDGET_NAME]);
  assert.equal(service.calls.auth, 1); assert.equal(service.calls.provider, 1); assert.equal(service.storage.total(), 500_000);
  const stored = service.storage.db.prepare(`SELECT * FROM ${RESERVATIONS}`).get();
  assert.equal(stored.subject_hash, createHmac("sha256", Buffer.from(service.environment.SUBJECT_HMAC_KEY, "hex")).update(`bodymake-recommendation-subject-v1:${OWNER}`).digest("hex"));
  assert.equal(stored.input_hash, createHash("sha256").update(JSON.stringify(body.request)).digest("hex"));
  assert.ok(!JSON.stringify(stored).includes(OWNER)); assert.ok(!JSON.stringify(stored).includes("meal_rice_chicken"));
  await error(await service.fetch(request("/recommend", body)), "budget_duplicate_request", 409);
  assert.equal(service.calls.provider, 1);
});

test("wrong/revoked/unavailable owner authentication and mismatched verifier identity cannot reserve or invoke", async (t) => {
  for (const code of ["auth_required", "invalid_auth_token", "auth_owner_only", "auth_revoked", "auth_unavailable"]) {
    const service = await setup(t, {}, { verifyAuthorization: async () => { throw new FirebaseAuthError(code); } });
    assert.ok((await service.fetch(request())).status >= 400); assert.equal(service.storage.total(), 0); assert.equal(service.calls.provider, 0);
  }
  const wrong = await setup(t, {}, { verifyAuthorization: async () => ({ uid: "another-synthetic-user" }) });
  await error(await wrong.fetch(request()), "auth_owner_only", 403); assert.equal(wrong.storage.total(), 0);
});

test("storage failure/ACK uncertainty/missing ledger never reaches provider; uncertain retry remains blocked", async (t) => {
  const missing = await setup(t, {}, {}, false);
  await error(await missing.fetch(request()), "budget_uninitialized", 503); assert.equal(missing.calls.provider, 0);
  const failed = await setup(t); failed.storage.fail = true;
  await error(await failed.fetch(request()), "budget_unavailable", 503); assert.equal(failed.calls.provider, 0);
  const unknown = await setup(t); unknown.storage.failSync = true;
  const body = fixture();
  await error(await unknown.fetch(request("/recommend", body)), "budget_unavailable", 503); assert.equal(unknown.calls.provider, 0);
  unknown.storage.failSync = false;
  await error(await unknown.fetch(request("/recommend", body)), "budget_duplicate_request", 409); assert.equal(unknown.calls.provider, 0);
});

test("provider failure or invalid ranking keeps its reservation and permanently gates later requests", async (t) => {
  for (const provider of [async () => { throw new Error("synthetic API key and private error"); }, async () => ({ mealIds: ["not-in-candidates"], workoutIds: [] })]) {
    const service = await setup(t, {}, { provider });
    const body = fixture();
    const res = await service.fetch(request("/recommend", body));
    assert.equal(res.status, 502); assert.ok(!JSON.stringify(await res.json()).includes("synthetic API key"));
    assert.equal(service.storage.total(), 500_000);
    await error(await service.fetch(request("/recommend", body)), "provider_verification_pending", 503);
    await error(await service.fetch(request()), "provider_verification_pending", 503);
    assert.equal(service.storage.total(), 500_000);
  }
});

test("cumulative budget stops the eleventh request without resetting or calling provider", async (t) => {
  const service = await setup(t);
  for (let index = 0; index < 10; index += 1) assert.equal((await service.fetch(request())).status, 200);
  await error(await service.fetch(request()), "budget_exhausted", 429);
  assert.equal(service.calls.provider, 10); assert.equal(service.storage.total(), 5_000_000);
});

test("one in-flight recommendation per DO blocks concurrent auth/provider work", async (t) => {
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const service = await setup(t, {}, { provider: async () => { calls += 1; await barrier; return ranking(); } });
  const first = service.fetch(request());
  while (!calls) await new Promise((resolve) => setTimeout(resolve, 1));
  await error(await service.fetch(request()), "request_in_progress", 429);
  assert.equal(calls, 1); release(); assert.equal((await first).status, 200);
});

test("admin initialization requires its secret and disabled API; repeat/partial init never resets existing total", async (t) => {
  const service = await setup(t, { BODYMAKE_RECOMMENDATION_API_ENABLED: "false" }, {}, false);
  const headers = { Origin: ORIGIN, Authorization: `Bearer ${ADMIN}`, "Content-Type": "application/json" };
  await error(await service.fetch(request("/admin/initialize", {})), "admin_required", 401);
  const initialized = await service.fetch(request("/admin/initialize", {}, { headers }));
  assert.equal(initialized.status, 200); assert.equal(service.storage.total(), 0);
  await error(await service.fetch(request("/admin/initialize", {}, { headers })), "budget_initialization_not_empty", 409);
  service.environment.BODYMAKE_RECOMMENDATION_API_ENABLED = "true";
  await error(await service.fetch(request("/admin/initialize", {}, { headers })), "initialization_not_allowed", 403);
});

test("admin budget is authenticated, read-only and returns summary without identity or reservation hashes", async (t) => {
  const service = await setup(t);
  await service.fetch(request());
  await error(await service.fetch(request("/admin/budget")), "admin_required", 401);
  const res = await service.fetch(request("/admin/budget", undefined, { headers: { Origin: ORIGIN, Authorization: `Bearer ${ADMIN}` } }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { limitMicros: 5_000_000, reservedMicros: 500_000, remainingMicros: 4_500_000, reservationCount: 1 });
  assert.equal(service.storage.total(), 500_000); assert.equal(service.calls.provider, 1);
});

function stoppedRestart(service) {
  return new BodyMakeRecommendationBudget({ storage: service.storage }, service.environment, {
    verifyAuthorization: async () => assert.fail("pending gate must stop before authentication"),
    provider: async () => assert.fail("pending gate must stop before paid work"),
  });
}
const journalCount = (storage, table) => storage.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;

test("cost uncertainty, timeout, incomplete/refused results halt every later request across restarts", async (t) => {
  for (const [code, status] of [["provider_cost_unconfirmed", 503], ["provider_timeout", 504], ["provider_incomplete", 502], ["provider_refusal", 502]]) {
    let calls = 0;
    const service = await setup(t, {}, { provider: async () => { calls += 1; throw new RecommendationApiError(code); } });
    await error(await service.fetch(request()), code, status);
    assert.equal(journalCount(service.storage, ATTEMPTS), 1);
    assert.equal(journalCount(service.storage, COMPLETIONS), 0);
    const restarted = stoppedRestart(service);
    await error(await restarted.fetch(request()), "provider_verification_pending", 503);
    await error(await service.fetch(request()), "provider_verification_pending", 503);
    assert.equal(service.storage.total(), 500_000); assert.equal(calls, 1);
  }
});

test("attempt write or acknowledgement must finish before provider; unresolved attempt blocks restart", async (t) => {
  const writeFailed = await setup(t);
  writeFailed.storage.failQuery = (query) => query.startsWith(`INSERT INTO ${ATTEMPTS}`);
  await error(await writeFailed.fetch(request()), "budget_unavailable", 503);
  assert.equal(writeFailed.calls.provider, 0); assert.equal(writeFailed.storage.total(), 500_000);
  assert.equal(journalCount(writeFailed.storage, ATTEMPTS), 0);

  const unknown = await setup(t);
  const originalSync = unknown.storage.sync.bind(unknown.storage);
  unknown.storage.sync = async () => {
    await originalSync();
    if (journalCount(unknown.storage, ATTEMPTS)) throw new Error("synthetic attempt acknowledgement lost");
  };
  await error(await unknown.fetch(request()), "budget_unavailable", 503);
  assert.equal(unknown.calls.provider, 0);
  unknown.storage.sync = originalSync;
  await error(await stoppedRestart(unknown).fetch(request()), "provider_verification_pending", 503);
  assert.equal(unknown.storage.total(), 500_000);
});

test("process crash after pending append has no reset or auto-unlock path", async (t) => {
  const service = await setup(t);
  const reservation = { requestId: randomUUID(), subjectHash: "a".repeat(64), inputHash: "b".repeat(64), upperBoundMicros: 500_000 };
  await reserveCumulativeBudget(createCloudflareBudgetStore(service.storage), reservation);
  await beginCloudflareProviderCall(service.storage, reservation);
  await error(await stoppedRestart(service).fetch(request()), "provider_verification_pending", 503);
  assert.equal(service.storage.total(), 500_000);
  assert.equal(journalCount(service.storage, COMPLETIONS), 0);
  service.environment.BODYMAKE_RECOMMENDATION_API_ENABLED = "false";
  await error(await service.fetch(request("/admin/initialize", {}, { headers: { Origin: ORIGIN, Authorization: `Bearer ${ADMIN}`, "Content-Type": "application/json" } })), "budget_initialization_not_empty", 409);
});

test("receipt insert failure after success keeps pending and cannot trigger another paid request", async (t) => {
  const service = await setup(t);
  service.storage.failQuery = (query) => query.startsWith(`INSERT INTO ${COMPLETIONS}`);
  await error(await service.fetch(request()), "budget_unavailable", 503);
  assert.equal(service.calls.provider, 1); assert.equal(journalCount(service.storage, COMPLETIONS), 0);
  service.storage.failQuery = null;
  await error(await stoppedRestart(service).fetch(request()), "provider_verification_pending", 503);
  assert.equal(service.storage.total(), 500_000);
});

test("receipt ACK loss permits resume only after re-reading valid committed evidence, never a duplicate charge", async (t) => {
  const service = await setup(t);
  const originalSync = service.storage.sync.bind(service.storage);
  service.storage.sync = async () => {
    await originalSync();
    if (journalCount(service.storage, COMPLETIONS)) throw new Error("synthetic completion acknowledgement lost");
  };
  const body = fixture();
  await error(await service.fetch(request("/recommend", body)), "budget_unavailable", 503);
  assert.equal(service.calls.provider, 1); assert.equal(journalCount(service.storage, COMPLETIONS), 1);
  service.storage.sync = originalSync;
  let calls = 0;
  const restarted = new BodyMakeRecommendationBudget({ storage: service.storage }, service.environment, {
    verifyAuthorization: async () => ({ uid: OWNER }), provider: async () => { calls += 1; return ranking(); },
  });
  await error(await restarted.fetch(request("/recommend", body)), "budget_duplicate_request", 409);
  assert.equal(calls, 0);
  assert.equal((await restarted.fetch(request())).status, 200);
  assert.equal(calls, 1); assert.equal(service.storage.total(), 1_000_000);
});
