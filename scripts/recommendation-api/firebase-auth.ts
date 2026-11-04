import { decodeProtectedHeader, importX509, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

// Deliberately not configurable: test-project, emulator, and caller-supplied keys are never trusted.
export const FIREBASE_RECOMMENDATION_PROJECT = "healthapp-14a3f";
const ISSUER = `https://securetoken.google.com/${FIREBASE_RECOMMENDATION_PROJECT}`;
const CERTIFICATES_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const ACCOUNT_LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const MAX_TOKEN_LENGTH = 8_192;
const MAX_RESPONSE_BYTES = 65_536;
const FETCH_TIMEOUT_MS = 3_000;
const KEY_REFRESH_COOLDOWN_MS = 60_000;
const MAX_KEY_CACHE_SECONDS = 21_600;

type AuthErrorCode = "auth_not_configured" | "auth_required" | "invalid_auth_token" | "auth_owner_only" | "auth_revoked" | "auth_unavailable";
const STATUS: Record<AuthErrorCode, number> = {
  auth_not_configured: 503, auth_required: 401, invalid_auth_token: 401,
  auth_owner_only: 403, auth_revoked: 401, auth_unavailable: 503,
};

/** Error strings never contain a token, URL with an API key, user data, or upstream error. */
export class FirebaseAuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  constructor(code: AuthErrorCode) {
    super(code);
    this.name = "FirebaseAuthError";
    this.code = code;
    this.status = STATUS[code];
  }
}

export interface FirebaseOwnerAuthConfig {
  /** Explicit server-side OWNER_UID. No first-user enrollment or public-user mode. */
  ownerUid?: string;
  /** Existing project's Firebase Web API key, not an Admin/service-account credential. */
  firebaseApiKey?: string;
}

export interface FirebaseOwnerAuthDependencies {
  fetch?: typeof globalThis.fetch;
  /** Milliseconds since epoch. Defaults to Date.now; injectable for RAM tests. */
  now?: () => number;
  /** Tests only. The production caller must not supply a resolver or certificate importer. */
  resolveKey?: (kid: string) => Promise<CryptoKey>;
  importCertificate?: typeof importX509;
  /** Tests may shorten, never lengthen, the fixed network timeout. */
  timeoutMs?: number;
}

function fail(code: AuthErrorCode): never { throw new FirebaseAuthError(code); }
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function uid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}
function seconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function checkedNow(now: () => number): number {
  let value: number;
  try { value = now(); } catch { return fail("auth_unavailable"); }
  if (!Number.isSafeInteger(value) || value <= 0) fail("auth_unavailable");
  return value;
}

function checkedClaims(payload: JWTPayload, nowSeconds: number): string {
  if (payload.iss !== ISSUER || payload.aud !== FIREBASE_RECOMMENDATION_PROJECT || !uid(payload.sub)
    || !seconds(payload.exp) || !seconds(payload.iat) || !seconds(payload.auth_time)
    || payload.exp <= nowSeconds || payload.iat > nowSeconds || payload.auth_time > payload.iat
    || payload.iat >= payload.exp || payload.exp - payload.iat > 3_600
    || payload.email_verified !== true || !record(payload.firebase)
    || payload.firebase.sign_in_provider !== "google.com" || payload.firebase.tenant !== undefined) {
    fail("invalid_auth_token");
  }
  return payload.sub;
}

/** Bounded, timed, no-retry fetch. The timer includes headers, the streamed body, and JSON parsing. */
async function fetchJson(
  fetchImpl: typeof globalThis.fetch, url: string, init: RequestInit, timeoutMs: number,
): Promise<{ value: unknown; headers: Headers }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new FirebaseAuthError("auth_unavailable"));
    }, timeoutMs);
  });
  const operation = async () => {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: "error", credentials: "omit", cache: "no-store" });
    const cancel = () => { void response.body?.cancel().catch(() => undefined); };
    if (!response.ok || !response.body) { cancel(); fail("auth_unavailable"); }
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") { cancel(); fail("auth_unavailable"); }
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) {
      cancel(); fail("auth_unavailable");
    }
    const reader = response.body.getReader();
    const cancelReader = () => { void reader.cancel().catch(() => undefined); };
    controller.signal.addEventListener("abort", cancelReader, { once: true });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let text = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES || controller.signal.aborted) fail("auth_unavailable");
        text += decoder.decode(chunk.value, { stream: true });
      }
      if (controller.signal.aborted) fail("auth_unavailable");
      text += decoder.decode();
      return { value: JSON.parse(text) as unknown, headers: response.headers };
    } finally {
      // Do not await cancellation: a broken upstream must not defeat the deadline.
      controller.signal.removeEventListener("abort", cancelReader);
      cancelReader();
    }
  };
  try { return await Promise.race([operation(), timeout]); }
  catch { return fail("auth_unavailable"); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

function certificateResolver(
  fetchImpl: typeof globalThis.fetch, now: () => number, timeoutMs: number, importCertificate: typeof importX509,
): (kid: string) => Promise<CryptoKey> {
  let certificates: Record<string, string> = Object.create(null) as Record<string, string>;
  let imported = new Map<string, Promise<CryptoKey>>();
  let expiresAt = 0;
  let nextRefreshAt = 0;
  let refreshing: Promise<void> | undefined;

  const refresh = async () => {
    const startedAt = checkedNow(now);
    nextRefreshAt = startedAt + KEY_REFRESH_COOLDOWN_MS;
    const { value, headers } = await fetchJson(fetchImpl, CERTIFICATES_URL, { method: "GET" }, timeoutMs);
    const policy = headers.get("cache-control") ?? "";
    const maxAges = [...policy.matchAll(/(?:^|,)\s*max-age=(\d+)\s*(?=,|$)/gi)];
    const age = headers.get("age") ?? "0";
    if (maxAges.length !== 1 || /(?:^|,)\s*(?:no-store|no-cache)\s*(?=,|$)/i.test(policy) || !/^\d+$/.test(age)) fail("auth_unavailable");
    const remaining = Number(maxAges[0][1]) - Number(age);
    if (!Number.isSafeInteger(remaining) || remaining <= 0 || !record(value)) fail("auth_unavailable");
    const entries = Object.entries(value);
    if (entries.length === 0 || entries.length > 20 || entries.some(([kid, pem]) =>
      !/^[A-Za-z0-9_-]{1,128}$/.test(kid) || typeof pem !== "string" || pem.length > 8_192
      || !pem.startsWith("-----BEGIN CERTIFICATE-----") || !pem.trimEnd().endsWith("-----END CERTIFICATE-----"))) {
      fail("auth_unavailable");
    }
    certificates = Object.fromEntries(entries) as Record<string, string>;
    imported = new Map();
    expiresAt = startedAt + Math.min(remaining, MAX_KEY_CACHE_SECONDS) * 1_000;
    if (expiresAt <= checkedNow(now)) fail("auth_unavailable");
  };

  return async (kid) => {
    const time = checkedNow(now);
    const hasKey = Object.hasOwn(certificates, kid);
    if (time >= expiresAt || !hasKey) {
      if (!refreshing) {
        if (time < nextRefreshAt) fail(time >= expiresAt ? "auth_unavailable" : "invalid_auth_token");
        refreshing = refresh().finally(() => { refreshing = undefined; });
      }
      await refreshing;
    }
    if (checkedNow(now) >= expiresAt) fail("auth_unavailable");
    if (!Object.hasOwn(certificates, kid)) fail("invalid_auth_token");
    if (!imported.has(kid)) imported.set(kid, importCertificate(certificates[kid], "RS256"));
    try { return await imported.get(kid)!; }
    catch { return fail("auth_unavailable"); }
  };
}

/**
 * Owner-only pilot authenticator. Call inside the DO BEFORE reserving budget or calling OpenAI.
 * Only {uid} escapes this function. No ID tokens, account responses, or user profiles are persisted.
 * Reference: firebase.google.com/docs/auth/admin/verify-id-tokens and /docs/reference/rest/auth.
 */
export function createFirebaseOwnerVerifier(
  config: FirebaseOwnerAuthConfig, dependencies: FirebaseOwnerAuthDependencies = {},
): (authorization: string | null) => Promise<{ uid: string }> {
  const { ownerUid, firebaseApiKey } = config;
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const timeoutMs = dependencies.timeoutMs ?? FETCH_TIMEOUT_MS;
  const resolveKey = dependencies.resolveKey ?? certificateResolver(fetchImpl, now, timeoutMs, dependencies.importCertificate ?? importX509);

  return async (authorization) => {
    if (!uid(ownerUid) || typeof firebaseApiKey !== "string" || !/^[A-Za-z0-9_-]{20,256}$/.test(firebaseApiKey)
      || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > FETCH_TIMEOUT_MS) fail("auth_not_configured");
    if (authorization === null || authorization === "") fail("auth_required");
    if (typeof authorization !== "string" || authorization.length > MAX_TOKEN_LENGTH + 7) fail("invalid_auth_token");
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
    if (!match) fail("invalid_auth_token");
    const token = match[1];
    let kid: string;
    try {
      const header = decodeProtectedHeader(token);
      if (header.alg !== "RS256" || typeof header.kid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid)
        || ["jku", "jwk", "x5u", "x5c"].some((key) => Object.hasOwn(header, key))) fail("invalid_auth_token");
      kid = header.kid;
    } catch { return fail("invalid_auth_token"); }
    let key: CryptoKey;
    try { key = await resolveKey(kid); }
    catch (error) {
      if (error instanceof FirebaseAuthError) throw error;
      return fail("auth_unavailable");
    }
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, key, {
        algorithms: ["RS256"], issuer: ISSUER, audience: FIREBASE_RECOMMENDATION_PROJECT,
        requiredClaims: ["exp", "iat", "sub", "auth_time"], currentDate: new Date(checkedNow(now)), clockTolerance: 0,
      }));
    } catch { return fail("invalid_auth_token"); }
    const subject = checkedClaims(payload, Math.floor(checkedNow(now) / 1_000));
    if (subject !== ownerUid) fail("auth_owner_only");

    // Signature checking alone does not detect revoked sessions or disabled/deleted accounts.
    // This fixed endpoint uses the user's token, not a new privileged Admin credential.
    const { value } = await fetchJson(fetchImpl, `${ACCOUNT_LOOKUP_URL}?key=${encodeURIComponent(firebaseApiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }),
    }, timeoutMs);
    if (!record(value) || !Array.isArray(value.users) || value.users.length !== 1 || !record(value.users[0])) fail("auth_unavailable");
    const user = value.users[0];
    // Omitted fields are deliberately NOT inferred: compatibility must be verified before launch.
    if (user.localId !== subject || typeof user.disabled !== "boolean" || user.emailVerified !== true
      || typeof user.validSince !== "string" || !/^(0|[1-9]\d{0,15})$/.test(user.validSince)) fail("auth_unavailable");
    const validSince = Number(user.validSince);
    if (!seconds(validSince)) fail("auth_unavailable");
    if (user.disabled || (payload.auth_time as number) < validSince) fail("auth_revoked");
    checkedClaims(payload, Math.floor(checkedNow(now) / 1_000));
    return { uid: subject };
  };
}
