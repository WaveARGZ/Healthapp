import { createRemoteJWKSet, jwtVerify } from "jose";
import { generateRequestDetails } from "web-push";

const testOrigin = "https://bodymake-test-14a3f.web.app";
const project = "bodymake-test-14a3f";
const clockSkew = 5_000;
const maxRestMs = 7_200_000;
const maxDeliveryDelayMs = 120_000;
const firebaseKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const cors = {
  "Access-Control-Allow-Origin": testOrigin,
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store",
};

const response = (status, data) => data === undefined
  ? new Response(null, { status, headers: cors })
  : Response.json(data, { status, headers: cors });

async function authorizeDeveloper(request) {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([-.\w]+)$/)?.[1];
  if (!token || token.length > 4096) return null;
  const { payload } = await jwtVerify(token, firebaseKeys, {
    issuer: `https://securetoken.google.com/${project}`, audience: project, algorithms: ["RS256"], requiredClaims: ["sub", "iat", "exp"],
  });
  if (typeof payload.sub !== "string" || payload.sub.length > 128 || typeof payload.email !== "string"
      || payload.email_verified !== true || payload.firebase?.sign_in_provider !== "google.com") return null;
  const access = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/developerAccess/${encodeURIComponent(payload.email)}`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(5000),
  });
  if (!access.ok || (await access.json()).fields?.enabled?.booleanValue !== true) return null;
  return payload.sub;
}

function keysFrom(env) {
  try {
    const keys = JSON.parse(env.REST_VAPID_KEYS);
    if (/^[\w-]{87}$/.test(keys.publicKey ?? "") && /^[\w-]{43}$/.test(keys.privateKey ?? "")) return keys;
  } catch { /* Treat an absent or incomplete secret as an unavailable sender. */ }
  return null;
}

function parseSubscription(value) {
  if (typeof value?.endpoint !== "string" || value.endpoint.length > 1024
      || !/^[\w-]{87}$/.test(value.keys?.p256dh ?? "") || !/^[\w-]{22}$/.test(value.keys?.auth ?? "")) return null;
  try {
    const endpoint = new URL(value.endpoint);
    const isApple = endpoint.hostname.endsWith(".push.apple.com");
    const isGoogle = endpoint.hostname === "fcm.googleapis.com" && /^\/fcm\/send\/[^/]+$/.test(endpoint.pathname);
    const isMozilla = endpoint.hostname === "updates.push.services.mozilla.com" && /^\/wpush\/v2\/[^/]+$/.test(endpoint.pathname);
    const isMicrosoft = endpoint.hostname.endsWith(".notify.windows.com");
    if (endpoint.protocol !== "https:" || endpoint.port || endpoint.username || endpoint.password || endpoint.hash
        || !(isApple || isGoogle || isMozilla || isMicrosoft)) return null;
    return { endpoint: endpoint.href, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
  } catch { return null; }
}

export function createRestPushWorker({ authorize = authorizeDeveloper, now = Date.now } = {}) {
  return {
    async fetch(request, env) {
      if (request.headers.get("Origin") !== testOrigin) return new Response(null, { status: 403 });
      if (request.method === "OPTIONS") return response(204);
      const pathname = new URL(request.url).pathname;
      const keys = keysFrom(env);
      if (!keys) return response(503);
      if (pathname === "/public-key" && request.method === "GET") return response(200, { publicKey: keys.publicKey });
      if (pathname !== "/rest-timer" || !["PUT", "DELETE"].includes(request.method)) return response(404);
      const uid = await authorize(request).catch(() => null);
      if (!uid) return response(403);
      try {
        if (Number(request.headers.get("Content-Length")) > 2400) return response(413);
        const raw = await request.text();
        if (raw.length > 2400) return response(413);
        const data = JSON.parse(raw);
        const time = now();
        if (typeof data.deviceId !== "string" || !/^[a-f0-9-]{36}$/.test(data.deviceId)
            || !Number.isSafeInteger(data.startedAt) || data.startedAt > time + clockSkew || data.startedAt < time - maxRestMs - maxDeliveryDelayMs) return response(400);
        let change = { startedAt: data.startedAt, scheduled: null };
        if (request.method === "PUT") {
          const subscription = parseSubscription(data.subscription);
          if (!subscription || !Number.isSafeInteger(data.endsAt) || data.endsAt < time - clockSkew
              || data.endsAt <= data.startedAt || data.endsAt > time + maxRestMs) return response(400);
          change = { startedAt: data.startedAt, scheduled: { subscription, endsAt: data.endsAt } };
        }
        const timer = env.REST_TIMERS.getByName(JSON.stringify([uid, data.deviceId]));
        const result = await timer.fetch("https://timer.internal/rest-timer", { method: request.method, body: JSON.stringify(change) });
        return response(result.ok ? 204 : 503);
      } catch {
        return response(400);
      }
    },
  };
}

async function sendRestPush(timer, env) {
  const keys = keysFrom(env);
  if (!keys) throw new Error("push_sender_unavailable");
  const notification = {
    web_push: 8030,
    notification: {
      title: "休憩時間が終了しました",
      body: "BodyMakeのタイマーを確認してください。",
      tag: `bodymake-rest-${timer.startedAt}`,
      navigate: `${testOrigin}/workouts/`,
    },
  };
  const details = generateRequestDetails(timer.scheduled.subscription, JSON.stringify(notification), {
    vapidDetails: { subject: testOrigin, ...keys },
    contentEncoding: "aes128gcm", TTL: 60, urgency: "high",
  });
  const result = await fetch(details.endpoint, {
    method: "POST", headers: details.headers, body: details.body, redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (!result.ok && ![400, 404, 410].includes(result.status)) throw new Error("push_delivery_failed");
}

export class WorkoutRestTimer {
  constructor(state, env, { now = Date.now, deliver = sendRestPush } = {}) {
    this.storage = state.storage;
    this.env = env;
    this.now = now;
    this.deliver = deliver;
  }

  async fetch(request) {
    const change = await request.json();
    const previous = await this.storage.get("timer");
    if (previous && (change.startedAt < previous.startedAt
      || (change.startedAt === previous.startedAt && !previous.scheduled))) return new Response(null, { status: 204 });
    await Promise.all([
      this.storage.put("timer", change),
      change.scheduled ? this.storage.setAlarm(change.scheduled.endsAt) : this.storage.deleteAlarm(),
    ]);
    return new Response(null, { status: 204 });
  }

  async alarm() {
    const timer = await this.storage.get("timer");
    if (!timer?.scheduled) return;
    if (this.now() < timer.scheduled.endsAt) {
      await this.storage.setAlarm(timer.scheduled.endsAt);
      return;
    }
    if (this.now() - timer.scheduled.endsAt <= maxDeliveryDelayMs) await this.deliver(timer, this.env);
    // A new timer may have been scheduled while the push service was responding.
    const current = await this.storage.get("timer");
    if (current?.startedAt === timer.startedAt) await this.storage.put("timer", { startedAt: timer.startedAt, scheduled: null });
  }
}

export default createRestPushWorker();
