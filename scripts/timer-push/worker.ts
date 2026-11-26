import { importJWK, SignJWT } from "jose";
import { createFirebaseAdviceVerifier, FirebaseAuthError } from "../recommendation-api/firebase-auth.ts";
import { applyTimerUpdate, fireTimerAlarm } from "./alarm-controller.mjs";
import { decideUpdate } from "./schedule.mjs";

const origins = new Set(["https://healthapp-14a3f.web.app", "https://healthapp-14a3f.firebaseapp.com"]);
type MailboxStub = { fetch: (input: Request) => Promise<Response> };
type MailboxNamespace = { idFromName: (name: string) => unknown; get: (id: unknown) => MailboxStub };
type Storage = Parameters<typeof applyTimerUpdate>[0];
interface Env { TIMER_MAILBOX: MailboxNamespace; FIREBASE_WEB_API_KEY: string; VAPID_JWK: string; VAPID_PUBLIC_KEY: string }
interface State { storage: Storage; blockConcurrencyWhile: <T>(callback: () => Promise<T>) => Promise<T> }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const bounded = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
function configured(env: Env) {
  try {
    if (!/^[A-Za-z0-9_-]{87}$/.test(env.VAPID_PUBLIC_KEY ?? "") || env.VAPID_JWK.length > 2048) return false;
    const jwk = JSON.parse(env.VAPID_JWK) as JsonWebKey;
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !bounded(jwk.x) || !bounded(jwk.y) || !bounded(jwk.d)) return false;
    const key = Uint8Array.from(atob(env.VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/") + "="), c => c.charCodeAt(0));
    const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return key.length === 65 && key[0] === 4 && encode(key.slice(1, 33)) === jwk.x && encode(key.slice(33)) === jwk.y;
  } catch { return false; }
}

async function body(request: Request) {
  if (!request.body) throw Error("invalid_request");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let raw = "", bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 4096) { await reader.cancel(); throw Error("invalid_request"); }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  const result: unknown = JSON.parse(raw);
  if (!result || typeof result !== "object" || Array.isArray(result)) throw Error("invalid_request");
  return result as Record<string, unknown>;
}

export function createTimerHandler(verify: (token: string | null) => Promise<{ uid: string }>) {
  return async (request: Request, env: Env): Promise<Response> => {
    const origin = request.headers.get("Origin");
    if (!origin || !origins.has(origin)) return json({ error: "origin_not_allowed" }, 403);
    const cors = { "Access-Control-Allow-Origin": origin, "Vary": "Origin" };
    const reply = (response: Response) => {
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(response.body, { status: response.status, headers });
    };
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      if (url.pathname !== "/v1/update") return reply(json({ error: "not_found" }, 404));
      return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "600" } });
    }
    if (url.pathname === "/v1/config" && request.method === "GET") {
      if (!configured(env)) return reply(json({ error: "not_configured" }, 503));
      return reply(json({ publicKey: env.VAPID_PUBLIC_KEY }));
    }
    if (url.pathname !== "/v1/update" || request.method !== "POST") return reply(json({ error: "not_found" }, 404));
    if (!configured(env)) return reply(json({ error: "not_configured" }, 503));
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return reply(json({ error: "invalid_request" }, 400));
    if (Number(request.headers.get("Content-Length") || 0) > 4096) return reply(json({ error: "invalid_request" }, 413));
    try {
      const user = await verify(request.headers.get("Authorization"));
      const value = await body(request);
      if (!bounded(value.device) || !["schedule", "cancel"].includes(String(value.kind))) return reply(json({ error: "invalid_request" }, 400));
      if (!decideUpdate(0, value, Date.now()).ok) return reply(json({ error: "invalid_request" }, 400));
      if (value.kind === "schedule") {
        const userDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(user.uid));
        const userKey = Array.from(new Uint8Array(userDigest), b => b.toString(16).padStart(2, "0")).join("");
        for (const key of ["admission-global", `admission-user:${userKey}`]) {
          const quota = env.TIMER_MAILBOX.get(env.TIMER_MAILBOX.idFromName(key));
          const response = await quota.fetch(new Request(`https://timer.internal/admit/${key === "admission-global" ? "global" : "user"}`, { method: "POST" }));
          if (!response.ok) return reply(json({ error: "notification_limit" }, 429));
        }
      }
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${user.uid}\0${value.device}`));
      const objectKey = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      const stub = env.TIMER_MAILBOX.get(env.TIMER_MAILBOX.idFromName(objectKey));
      const payload = { kind: value.kind, version: value.version, deadline: value.deadline, endpoint: value.endpoint };
      return reply(await stub.fetch(new Request("https://timer.internal/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })));
    } catch (error) {
      if (error instanceof FirebaseAuthError) return reply(json({ error: error.code }, error.status));
      return reply(json({ error: "request_failed" }, 400));
    }
  };
}

export async function sendApplePush(endpoint: string, env: Env, fetcher = fetch) {
  const jwk = JSON.parse(env.VAPID_JWK) as JsonWebKey;
  const key = await importJWK(jwk, "ES256");
  const token = await new SignJWT({}).setProtectedHeader({ alg: "ES256", typ: "JWT" }).setAudience(new URL(endpoint).origin)
    .setSubject("https://healthapp-14a3f.web.app/").setExpirationTime("1h").sign(key);
  const response = await fetcher(endpoint, { method: "POST", redirect: "error", headers: { Authorization: `vapid t=${token}, k=${env.VAPID_PUBLIC_KEY}`, TTL: "30", Urgency: "high" }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw Error("push_failed");
}

export class TimerMailbox {
  private readonly state: State;
  private readonly env: Env;
  constructor(state: State, env: Env) { this.state = state; this.env = env; }
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && (path === "/admit/global" || path === "/admit/user")) {
      try {
        return await this.state.blockConcurrencyWhile(async () => {
          const day = Math.floor(Date.now() / 86400000);
          const previous = await this.state.storage.get("quota") as { day: number; count: number } | undefined;
          const count = previous?.day === day ? previous.count : 0;
          if (count >= (path === "/admit/global" ? 4000 : 200)) return json({ error: "limit" }, 429);
          await this.state.storage.transaction(async () => {
            await this.state.storage.put("quota", { day, count: count + 1 });
            const cleanupAt = Date.now() + 25 * 60 * 60 * 1000;
            await this.state.storage.put("cleanupAt", cleanupAt);
            await this.state.storage.setAlarm(cleanupAt);
          });
          return json({ ok: true });
        });
      } catch { return json({ error: "not_available" }, 503); }
    }
    if (request.method !== "POST" || path !== "/update") return json({ error: "not_found" }, 404);
    try {
      const update = await body(request);
      return await this.state.blockConcurrencyWhile(async () => {
        const result = await applyTimerUpdate(this.state.storage, update, Date.now());
        return json(result, result.ok ? 200 : 409);
      });
    } catch { return json({ error: "not_available" }, 503); }
  }
  async alarm() {
    await this.state.blockConcurrencyWhile(async () => {
      // Delivery failures are not retried; storage failures may be safely retried.
      await fireTimerAlarm(this.state.storage, Date.now(), (endpoint: string) => sendApplePush(endpoint, this.env));
    });
  }
}

const timerWorker = { async fetch(request: Request, env: Env) {
  const verify = createFirebaseAdviceVerifier({ ownerUid: "unused-in-authenticated-mode", firebaseApiKey: env.FIREBASE_WEB_API_KEY, accessMode: "authenticated" });
  return createTimerHandler(verify)(request, env);
} };
export default timerWorker;
