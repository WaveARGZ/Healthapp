import { createCloudflareBudgetStore, initializeCloudflareBudgetStore, BudgetInitializationError, BudgetProviderGateError, assertCloudflareProviderReady, beginCloudflareProviderCall, confirmCloudflareProviderCall } from "./cloudflare-budget-store.ts";
import type { CloudflareSqliteStorage } from "./cloudflare-budget-store.ts";
import { CUMULATIVE_BUDGET_LIMIT_MICROS, CumulativeBudgetError, invokeWithCumulativeBudget } from "./cumulative-budget.ts";
import type { CumulativeBudgetLedger } from "./cumulative-budget.ts";
import { getProductionCostPolicy } from "./cost-policy.ts";
import { createFirebaseOwnerVerifier, FirebaseAuthError } from "./firebase-auth.ts";
import { createOpenAIProvider, RecommendationApiError, validateRanking } from "./provider.ts";
import type { RecommendationProvider } from "./provider.ts";
import { validateRequest } from "./request.ts";

export const GLOBAL_RECOMMENDATION_BUDGET_NAME = "lifetime-usd5-v1";
const ORIGINS = new Set(["https://healthapp-14a3f.web.app", "https://healthapp-14a3f.firebaseapp.com"]);
const MAX_BODY_BYTES = 16_384;
const MAX_BODY_CHARS = 12_000;
const BODY_TIMEOUT_MS = 5_000;
const PATH_METHODS: Record<string, string> = { "/health": "GET", "/session": "GET", "/recommend": "POST", "/admin/initialize": "POST", "/admin/budget": "GET" };

interface BudgetNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface RecommendationWorkerEnvironment {
  RECOMMENDATION_BUDGET?: BudgetNamespace;
  BODYMAKE_RECOMMENDATION_API_ENABLED?: string;
  BODYMAKE_PRICING_VERIFIED_AT?: string;
  OPENAI_API_KEY?: string;
  OWNER_UID?: string;
  FIREBASE_WEB_API_KEY?: string;
  SUBJECT_HMAC_KEY?: string;
  INITIALIZE_SECRET?: string;
}
/** Test-only constructor injections; deployed Durable Objects receive only ctx and env. */
export interface RecommendationWorkerDependencies {
  verifyAuthorization?: (authorization: string | null) => Promise<{ uid: string }>;
  provider?: RecommendationProvider;
  now?: () => number;
}

const ERROR_STATUS: Record<string, number> = {
  not_found: 404, method_not_allowed: 405, origin_not_allowed: 403, https_required: 403,
  preflight_not_allowed: 403, json_required: 415, encoding_not_supported: 415,
  request_too_large: 413, request_timeout: 408, invalid_json: 400, invalid_request: 400,
  consent_required: 403, unsafe_candidates: 400, api_disabled: 503, configuration_required: 503,
  pricing_not_verified: 503, pricing_verification_expired: 503, request_in_progress: 429,
  admin_required: 401, initialization_not_allowed: 403, budget_initialization_not_empty: 409,
  budget_invalid_request: 400, budget_uninitialized: 503, budget_corrupt: 503, budget_unavailable: 503,
  budget_duplicate_request: 409, budget_request_conflict: 409, budget_exhausted: 429, budget_capacity_reached: 429,
  auth_not_configured: 503, auth_required: 401, invalid_auth_token: 401, auth_owner_only: 403,
  auth_revoked: 401, auth_unavailable: 503, provider_bad_output: 502, provider_failed: 502,
  provider_timeout: 504, provider_incomplete: 502, provider_refusal: 502, service_unavailable: 503,
  provider_cost_unconfirmed: 503, provider_verification_pending: 503,
};
function fail(code: string): never { throw new RecommendationApiError(code, ERROR_STATUS[code] ?? 503); }

function response(request: Request, status: number, body: unknown): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", Vary: "Origin" });
  const origin = request.headers.get("Origin");
  if (origin && ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}
function errorResponse(request: Request, error: unknown): Response {
  const trusted = error instanceof RecommendationApiError || error instanceof CumulativeBudgetError || error instanceof FirebaseAuthError || error instanceof BudgetInitializationError || error instanceof BudgetProviderGateError;
  const code = trusted && Object.hasOwn(ERROR_STATUS, error.code) ? error.code : "service_unavailable";
  return response(request, ERROR_STATUS[code], { error: code });
}

/** Recheck at the DO boundary too: direct/internal calls cannot skip the public HTTP contract. */
function route(request: Request): { path: string; preflight: Response | null } {
  const url = new URL(request.url);
  if (url.protocol !== "https:") fail("https_required");
  const origin = request.headers.get("Origin");
  if (!origin || !ORIGINS.has(origin)) fail("origin_not_allowed");
  if (url.search || url.hash || !Object.hasOwn(PATH_METHODS, url.pathname)) fail("not_found");
  const method = PATH_METHODS[url.pathname];
  if (request.method === "OPTIONS") {
    const wantedHeaders = (request.headers.get("Access-Control-Request-Headers") ?? "").toLowerCase().split(",").map((value) => value.trim()).filter(Boolean);
    if (request.headers.get("Access-Control-Request-Method") !== method || wantedHeaders.some((header) => !["authorization", "content-type"].includes(header))) fail("preflight_not_allowed");
    return { path: url.pathname, preflight: new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": method, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Cache-Control": "no-store", Vary: "Origin" } }) };
  }
  if (request.method !== method) fail("method_not_allowed");
  if ((request.headers.get("Authorization") ?? "").length > 8_200) fail("invalid_auth_token");
  return { path: url.pathname, preflight: null };
}

async function readJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? "")) fail("json_required");
  if (request.headers.has("Content-Encoding")) fail("encoding_not_supported");
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) fail("request_too_large");
  if (!request.body) fail("invalid_json");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void reader.cancel().catch(() => undefined);
      reject(new RecommendationApiError("request_timeout", 408));
    }, BODY_TIMEOUT_MS);
  });
  const parse = async () => {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let text = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) fail("request_too_large");
      text += decoder.decode(chunk.value, { stream: true });
      if (text.length > MAX_BODY_CHARS) fail("request_too_large");
    }
    text += decoder.decode();
    if (text.length > MAX_BODY_CHARS) fail("request_too_large");
    try { return JSON.parse(text) as unknown; } catch { return fail("invalid_json"); }
  };
  try { return await Promise.race([parse(), timeout]); }
  catch (error) { if (error instanceof RecommendationApiError) throw error; return fail("invalid_json"); }
  finally {
    if (timer !== undefined) clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}

async function envelope(request: Request) {
  const checked = validateRequest(await readJson(request));
  // Only cryptographically random v4 request IDs in this production pilot.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(checked.requestId)) fail("invalid_request");
  return { requestId: checked.requestId, transferConsent: true as const, request: checked.request };
}

function hexSecret(value: unknown): value is string {
  return typeof value === "string" && value.length >= 64 && value.length <= 256 && value.length % 2 === 0 && /^[a-f0-9]+$/.test(value);
}
function productionConfiguration(env: RecommendationWorkerEnvironment, now: number) {
  if (env.BODYMAKE_RECOMMENDATION_API_ENABLED !== "true") fail("api_disabled");
  if (typeof env.OPENAI_API_KEY !== "string" || !/^[A-Za-z0-9_-]{12,512}$/.test(env.OPENAI_API_KEY)
    || typeof env.OWNER_UID !== "string" || env.OWNER_UID.length === 0 || env.OWNER_UID.length > 128 || env.OWNER_UID.trim() !== env.OWNER_UID || /[\u0000-\u001f\u007f]/.test(env.OWNER_UID)
    || typeof env.FIREBASE_WEB_API_KEY !== "string" || !/^[A-Za-z0-9_-]{20,256}$/.test(env.FIREBASE_WEB_API_KEY)
    || !hexSecret(env.SUBJECT_HMAC_KEY)) fail("configuration_required");
  return { ...getProductionCostPolicy(env, now), apiKey: env.OPENAI_API_KEY, subjectHmacKey: env.SUBJECT_HMAC_KEY };
}

function requireAdmin(request: Request, env: RecommendationWorkerEnvironment): void {
  if (!hexSecret(env.INITIALIZE_SECRET)) fail("admin_required");
  const authorization = request.headers.get("Authorization") ?? "";
  const expected = `Bearer ${env.INITIALIZE_SECRET}`;
  if (authorization.length !== expected.length) fail("admin_required");
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ authorization.charCodeAt(index);
  if (mismatch !== 0) fail("admin_required");
}
async function initializeInput(request: Request, env: RecommendationWorkerEnvironment) {
  requireAdmin(request, env);
  if (env.BODYMAKE_RECOMMENDATION_API_ENABLED === "true") fail("initialization_not_allowed");
  const body = await readJson(request);
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 0) fail("invalid_request");
  return {};
}
function toHex(bytes: ArrayBuffer): string { return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function hashes(uid: string, secret: string, input: unknown) {
  const keyBytes = Uint8Array.from(secret.match(/../g)!, (pair) => Number.parseInt(pair, 16));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const encoder = new TextEncoder();
  const subjectHash = toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(`bodymake-recommendation-subject-v1:${uid}`)));
  const inputHash = toHex(await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(input))));
  return { subjectHash, inputHash };
}

/** No provider keys, UID, health records, model output, or tokens are logged or persisted here. */
export class BodyMakeRecommendationBudget {
  private readonly storage: CloudflareSqliteStorage;
  private readonly env: RecommendationWorkerEnvironment;
  private readonly dependencies: RecommendationWorkerDependencies;
  private readonly verifyAuthorization: (authorization: string | null) => Promise<{ uid: string }>;
  private recommendationInFlight = false;

  constructor(ctx: { storage: CloudflareSqliteStorage }, env: RecommendationWorkerEnvironment, dependencies: RecommendationWorkerDependencies = {}) {
    this.storage = ctx.storage;
    this.env = env;
    this.dependencies = dependencies;
    this.verifyAuthorization = dependencies.verifyAuthorization ?? createFirebaseOwnerVerifier({ ownerUid: env.OWNER_UID, firebaseApiKey: env.FIREBASE_WEB_API_KEY });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const { path, preflight } = route(request);
      if (preflight) return preflight;
      // Preparation health deliberately does not advertise a usable public API.
      if (path === "/health") return response(request, 200, { enabled: false, stage: "preparation" });
      if (path === "/session") {
        // A read-only owner preflight works while paid inference remains disabled.
        // No initialization, reservation, token echo, health data or provider call.
        const owner = await this.verifyAuthorization(request.headers.get("Authorization"));
        if (owner.uid !== this.env.OWNER_UID) fail("auth_owner_only");
        if (this.env.BODYMAKE_RECOMMENDATION_API_ENABLED !== "true") return response(request, 200, { authorized: true, enabled: false });
        const configuration = productionConfiguration(this.env, (this.dependencies.now ?? Date.now)());
        if (this.recommendationInFlight) fail("request_in_progress");
        assertCloudflareProviderReady(this.storage);
        const ready = await createCloudflareBudgetStore(this.storage).transaction((current) => {
          const ledger = current as CumulativeBudgetLedger;
          return { ledger, result: ledger.reservedMicros + configuration.upperBoundMicros <= ledger.limitMicros };
        });
        if (!ready) fail("budget_exhausted");
        return response(request, 200, { authorized: true, enabled: ready });
      }
      if (path === "/admin/initialize") {
        await initializeInput(request, this.env);
        await initializeCloudflareBudgetStore(this.storage);
        return response(request, 200, { initialized: true, limitMicros: CUMULATIVE_BUDGET_LIMIT_MICROS });
      }
      const store = createCloudflareBudgetStore(this.storage);
      if (path === "/admin/budget") {
        requireAdmin(request, this.env);
        const summary = await store.transaction((current) => {
          const ledger = current as CumulativeBudgetLedger; // Adapter validates it before and after this read-only callback.
          return { ledger, result: { limitMicros: ledger.limitMicros, reservedMicros: ledger.reservedMicros, remainingMicros: ledger.limitMicros - ledger.reservedMicros, reservationCount: ledger.reservations.length } };
        });
        return response(request, 200, summary);
      }
      const configuration = productionConfiguration(this.env, (this.dependencies.now ?? Date.now)());
      const input = await envelope(request);
      if (this.recommendationInFlight) fail("request_in_progress");
      this.recommendationInFlight = true;
      try {
        assertCloudflareProviderReady(this.storage);
        const owner = await this.verifyAuthorization(request.headers.get("Authorization"));
        if (owner.uid !== this.env.OWNER_UID) fail("auth_owner_only");
        const identifiers = await hashes(owner.uid, configuration.subjectHmacKey, input.request);
        const provider = this.dependencies.provider ?? createOpenAIProvider(configuration);
        const reservation = { requestId: input.requestId, ...identifiers, upperBoundMicros: configuration.upperBoundMicros };
        const ranking = await invokeWithCumulativeBudget(store, reservation, async () => {
          const ordinal = await beginCloudflareProviderCall(this.storage, reservation);
          let confirmedRanking;
          try { confirmedRanking = validateRanking(await provider(input.request), input.request); }
          catch (error) { if (error instanceof RecommendationApiError) throw error; return fail("provider_failed"); }
          // The production provider returns only after exact model/tier/usage validation.
          // Any error above leaves the durable attempt unresolved, including across restarts.
          await confirmCloudflareProviderCall(this.storage, ordinal);
          return confirmedRanking;
        });
        return response(request, 200, { ...ranking, source: "openai", model: configuration.model, requestId: input.requestId });
      } finally { this.recommendationInFlight = false; }
    } catch (error) { return errorResponse(request, error); }
  }
}

/** The one fixed Durable Object identity, never a user/request/month-specific namespace. */
const worker = {
  async fetch(request: Request, env: RecommendationWorkerEnvironment): Promise<Response> {
    try {
      const { path, preflight } = route(request);
      if (preflight) return preflight;
      if (path === "/health") return response(request, 200, { enabled: false, stage: "preparation" });
      let body: unknown;
      if (path === "/recommend") {
        productionConfiguration(env, Date.now());
        body = await envelope(request);
      } else if (path === "/admin/initialize") body = await initializeInput(request, env);
      else if (path !== "/session") requireAdmin(request, env);
      const namespace = env.RECOMMENDATION_BUDGET;
      if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") fail("configuration_required");
      const headers = new Headers({ Origin: request.headers.get("Origin")!, Authorization: request.headers.get("Authorization") ?? "" });
      if (body !== undefined) headers.set("Content-Type", "application/json");
      const internal = new Request(`https://bodymake-budget.internal${path}`, { method: request.method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return await namespace.get(namespace.idFromName(GLOBAL_RECOMMENDATION_BUDGET_NAME)).fetch(internal);
    } catch (error) { return errorResponse(request, error); }
  },
};

export default worker;
