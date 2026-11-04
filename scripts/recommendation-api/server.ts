import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { RecommendationResult } from "../../lib/recommendations/types.ts";
import { validateRequest } from "./request.ts";
export { validateRequest } from "./request.ts";
import { createOpenAIProvider, RecommendationApiError, validateRanking } from "./provider.ts";
import type { RecommendationProvider } from "./provider.ts";

const ORIGINS = new Set(["http://localhost:3001", "http://127.0.0.1:3001"]);
const MAX_BODY_BYTES = 16_384;
const MAX_BODY_CHARS = 12_000;
const SESSION_LIFETIME_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 4;

export interface GatewayConfig {
  enabled: boolean;
  reason: "ready" | "disabled" | "configuration_required";
  apiKey: string;
  model: string;
  maxCalls: number;
  maxConcurrent: number;
  sessionBudgetUsd: number;
  reservedUsdPerCall: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

function setting(value: string | undefined, fallback: number, min: number, max: number, integer = false): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) return NaN;
  return parsed;
}

/** No implicit model, pricing assumption, key lookup, dotenv read, or paid enablement. */
export function readGatewayConfig(environment: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const requested = environment.BODYMAKE_RECOMMENDATION_API_ENABLED === "true";
  const model = environment.OPENAI_RECOMMENDATION_MODEL ?? "";
  const apiKey = environment.OPENAI_API_KEY ?? "";
  const config: GatewayConfig = {
    enabled: false, reason: requested ? "configuration_required" : "disabled", apiKey, model,
    maxCalls: setting(environment.BODYMAKE_RECOMMENDATION_MAX_CALLS, 10, 1, 100, true),
    maxConcurrent: setting(environment.BODYMAKE_RECOMMENDATION_MAX_CONCURRENT, 1, 1, 2, true),
    sessionBudgetUsd: setting(environment.BODYMAKE_RECOMMENDATION_SESSION_BUDGET_USD, NaN, 0.001, 5),
    reservedUsdPerCall: setting(environment.BODYMAKE_RECOMMENDATION_RESERVE_USD_PER_CALL, NaN, 0.001, 5),
    maxOutputTokens: setting(environment.BODYMAKE_RECOMMENDATION_MAX_OUTPUT_TOKENS, 400, 64, 1024, true),
    timeoutMs: setting(environment.BODYMAKE_RECOMMENDATION_TIMEOUT_MS, 20_000, 1000, 60_000, true),
  };
  const numbersValid = [config.maxCalls, config.maxConcurrent, config.sessionBudgetUsd, config.reservedUsdPerCall, config.maxOutputTokens, config.timeoutMs].every(Number.isFinite);
  // The model identifier is configuration, not a user request; arbitrary URLs/headers are rejected.
  if (requested && numbersValid && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(model) && apiKey.length >= 12 && apiKey.length <= 512 && !/\s/.test(apiKey) && config.reservedUsdPerCall <= config.sessionBudgetUsd) {
    config.enabled = true;
    config.reason = "ready";
  }
  return config;
}

function fail(code = "invalid_request", status = 400): never { throw new RecommendationApiError(code, status); }

async function readBody(request: IncomingMessage): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? "")) fail("json_required", 415);
  if (request.headers["content-encoding"] !== undefined) fail("encoding_not_supported", 415);
  if (Number(request.headers["content-length"]) > MAX_BODY_BYTES) fail("request_too_large", 413);
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) fail("request_too_large", 413);
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.length > MAX_BODY_CHARS) fail("request_too_large", 413);
  try { return JSON.parse(text); } catch { return fail("invalid_json"); }
}

interface Outcome { status: number; body: RecommendationResult | { error: string } }
interface Session { token: string; origin: string; expiresAt: number }
interface Attempt { digest: string; origin: string; outcome: Promise<Outcome> }

/** RAM-only process lifecycle, injectable provider for tests; factory never starts a listener. */
export function createRecommendationServer(options: { config: GatewayConfig; provider?: RecommendationProvider; now?: () => number }) {
  const { config } = options;
  const now = options.now ?? Date.now;
  const provider = options.provider ?? createOpenAIProvider(config);
  const sessions = new Map<string, Session>();
  const attempts = new Map<string, Attempt>();
  let startedCalls = 0;
  let activeCalls = 0;
  let reservedMicros = 0;
  const reservationMicros = Math.ceil(config.reservedUsdPerCall * 1_000_000);
  const budgetMicros = Math.floor(config.sessionBudgetUsd * 1_000_000);
  const server = createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
      res.end(JSON.stringify(body));
    };
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 3004;
      if (!new Set([`localhost:${port}`, `127.0.0.1:${port}`]).has(req.headers.host ?? "") || !["127.0.0.1", "::ffff:127.0.0.1", "::1"].includes(req.socket.remoteAddress ?? "")) fail("host_not_allowed", 403);
      const origin = req.headers.origin;
      if (typeof origin !== "string" || !ORIGINS.has(origin)) fail("origin_not_allowed", 403);
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      if (!["/health", "/session", "/recommend"].includes(req.url ?? "")) fail("not_found", 404);
      if (req.method === "OPTIONS") {
        const method = req.headers["access-control-request-method"];
        const headers = String(req.headers["access-control-request-headers"] ?? "").toLowerCase().split(",").map((value) => value.trim()).filter(Boolean);
        if (method !== (req.url === "/recommend" ? "POST" : "GET") || headers.some((value) => !["authorization", "content-type"].includes(value))) fail("preflight_not_allowed", 403);
        res.setHeader("Access-Control-Allow-Methods", method);
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        // Only the exact local test origin can pair, including browsers issuing PNA checks.
        if (req.headers["access-control-request-private-network"] === "true") res.setHeader("Access-Control-Allow-Private-Network", "true");
        res.writeHead(204, { "Cache-Control": "no-store" }); res.end(); return;
      }
      if (req.url === "/health" && req.method === "GET") {
        reply(200, { enabled: config.enabled, reason: config.reason, remainingCalls: Math.max(0, config.maxCalls - startedCalls), sessionBudgetUsd: config.sessionBudgetUsd, reservedBudgetUsd: reservedMicros / 1_000_000 }); return;
      }
      if ((req.url === "/recommend" && req.method !== "POST") || (req.url !== "/recommend" && req.method !== "GET")) fail("method_not_allowed", 405);
      if (!config.enabled) fail("api_disabled", 503);
      for (const [key, session] of sessions) if (session.expiresAt <= now()) sessions.delete(key);
      if (req.url === "/session") {
        // Repeated explicit requests/page reloads share the origin's still-valid RAM token;
        // they must not create a new session or reset the process-wide call/budget counters.
        const existing = [...sessions.values()].find((session) => session.origin === origin);
        if (existing) { reply(200, { token: existing.token, expiresAt: existing.expiresAt }); return; }
        if (sessions.size >= MAX_SESSIONS) fail("session_limit_reached", 429);
        const session = { token: randomBytes(32).toString("hex"), origin, expiresAt: now() + SESSION_LIFETIME_MS };
        sessions.set(session.token, session);
        reply(200, { token: session.token, expiresAt: session.expiresAt }); return;
      }
      const authorization = req.headers.authorization ?? "";
      if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) fail("session_required", 401);
      const token = authorization.slice(7);
      const session = sessions.get(token);
      if (!session || session.origin !== origin || !timingSafeEqual(Buffer.from(token), Buffer.from(session.token))) fail("session_required", 401);
      const { requestId, request } = validateRequest(await readBody(req));
      const digest = createHash("sha256").update(JSON.stringify(request)).digest("hex");
      const previous = attempts.get(requestId);
      if (previous) {
        if (previous.digest !== digest || previous.origin !== origin) fail("request_id_conflict", 409);
        const outcome = await previous.outcome; reply(outcome.status, outcome.body); return;
      }
      if (startedCalls >= config.maxCalls) fail("request_limit_reached", 429);
      if (reservedMicros + reservationMicros > budgetMicros) fail("session_budget_reached", 429);
      if (activeCalls >= config.maxConcurrent) fail("request_in_progress", 429);
      // Reserve synchronously before yielding. Failures/timeouts consume a reservation because
      // a provider may have accepted/billed a request even if no response reaches this process.
      startedCalls += 1; activeCalls += 1; reservedMicros += reservationMicros;
      const outcome: Promise<Outcome> = Promise.resolve().then(async () => {
        try {
          const ranking = validateRanking(await provider(request), request);
          return { status: 200, body: { ...ranking, source: "openai", model: config.model, requestId } } as Outcome;
        } catch (error) {
          const safe = error instanceof RecommendationApiError ? error : new RecommendationApiError("provider_failed");
          return { status: safe.status, body: { error: safe.code } };
        } finally { activeCalls -= 1; }
      });
      attempts.set(requestId, { digest, origin, outcome });
      const result = await outcome;
      reply(result.status, result.body);
    } catch (error) {
      const safe = error instanceof RecommendationApiError ? error : new RecommendationApiError("request_failed", 400);
      reply(safe.status, { error: safe.code });
    }
  });
  // Limit slow/unbounded local callers without holding disk-backed request logs.
  server.requestTimeout = 10_000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 30;
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const config = readGatewayConfig();
  const server = createRecommendationServer({ config });
  server.on("error", () => { console.error("Recommendation gateway could not start. Check local port 3004."); process.exitCode = 1; });
  server.listen(3004, "127.0.0.1", () => {
    console.log(`BodyMake local recommendation gateway: ${config.enabled ? "enabled" : "disabled"}. Test UI only; RAM-only limits reset when this process is restarted.`);
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => { process.exitCode = 0; }));
}
