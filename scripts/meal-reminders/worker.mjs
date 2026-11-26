import { createRemoteJWKSet, jwtVerify } from "jose";
import { generateRequestDetails } from "web-push";
import { createMealPresenceReader } from "./firestore.mjs";
import { nextMealReminder } from "./schedule.mjs";

const testOrigin = "https://bodymake-test-14a3f.web.app";
const project = "bodymake-test-14a3f";
const maxBodyBytes = 4096;
const maxDelayMs = 2 * 60 * 1000;
const deviceIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const uidPattern = /^[A-Za-z0-9_-]{1,128}$/;
const emailPattern = /^[^\s/@]{1,64}@[^\s/@]{1,255}$/;
const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
  { timeoutDuration: 5000 },
);
const cors = {
  "Access-Control-Allow-Origin": testOrigin,
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store",
  Vary: "Origin",
};

function reply(status, data) {
  return data === undefined
    ? new Response(null, { status, headers: cors })
    : Response.json(data, { status, headers: cors });
}

async function authorizeDeveloper(request) {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([-.\w]+)$/)?.[1];
  if (!token || token.length > 4096) return null;
  const { payload } = await jwtVerify(token, firebaseKeys, {
    issuer: `https://securetoken.google.com/${project}`,
    audience: project,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "iat", "exp"],
  });
  if (typeof payload.sub !== "string" || !uidPattern.test(payload.sub) || typeof payload.email !== "string"
      || !emailPattern.test(payload.email) || payload.email_verified !== true || payload.firebase?.sign_in_provider !== "google.com") return null;
  const access = await fetch(
    `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/developerAccess/${encodeURIComponent(payload.email)}`,
    { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(5000) },
  );
  return access.ok && (await access.json()).fields?.enabled?.booleanValue === true
    ? { uid: payload.sub, email: payload.email } : null;
}

function keysFrom(env) {
  try {
    const { publicKey, privateKey } = JSON.parse(env.MEAL_VAPID_KEYS);
    if (/^[A-Za-z0-9_-]{87}$/.test(publicKey ?? "") && /^[A-Za-z0-9_-]{43}$/.test(privateKey ?? "")) {
      return { publicKey, privateKey };
    }
  } catch { /* Missing or invalid settings disable enrollment. */ }
  return null;
}

function parseSubscription(value) {
  if (typeof value?.endpoint !== "string" || value.endpoint.length > 1024
      || typeof value.keys?.p256dh !== "string" || !/^[A-Za-z0-9_-]{87}$/.test(value.keys.p256dh)
      || typeof value.keys?.auth !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(value.keys.auth)) return null;
  try {
    const endpoint = new URL(value.endpoint);
    if (endpoint.protocol !== "https:" || endpoint.port || endpoint.username || endpoint.password || endpoint.hash) return null;
    const isApple = endpoint.hostname.endsWith(".push.apple.com");
    const isGoogle = endpoint.hostname === "fcm.googleapis.com" && /^\/fcm\/send\/[^/]+$/.test(endpoint.pathname);
    const isMozilla = endpoint.hostname === "updates.push.services.mozilla.com" && /^\/wpush\/v2\/[^/]+$/.test(endpoint.pathname);
    const isMicrosoft = endpoint.hostname.endsWith(".notify.windows.com");
    if (!(isApple || isGoogle || isMozilla || isMicrosoft)) return null;
    return { endpoint: endpoint.href, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
  } catch { return null; }
}

async function readBody(request) {
  if (!request.body || !request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("invalid_request");
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBodyBytes) {
      await reader.cancel();
      throw new Error("request_too_large");
    }
    raw += decoder.decode(value, { stream: true });
  }
  const data = JSON.parse(raw + decoder.decode());
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("invalid_request");
  return data;
}

function hasReader(env) {
  try {
    createMealPresenceReader({ credentials: env.MEAL_READER_CREDENTIALS });
    return true;
  } catch { return false; }
}

export function createMealReminderWorker({ authorize = authorizeDeveloper, readerConfigured = hasReader } = {}) {
  return {
    async fetch(request, env) {
      if (request.headers.get("Origin") !== testOrigin) return new Response(null, { status: 403 });
      const url = new URL(request.url);
      const path = url.pathname;
      if (request.method === "OPTIONS" && (path === "/public-key" || path === "/meal-reminder")) return reply(204);
      if (path === "/public-key" && request.method === "GET") {
        const keys = keysFrom(env);
        return keys && readerConfigured(env) ? reply(200, { publicKey: keys.publicKey }) : reply(503);
      }
      if (path !== "/meal-reminder" || !["GET", "PUT", "DELETE"].includes(request.method)) return reply(404);

      const identity = await authorize(request).catch(() => null);
      if (typeof identity?.uid !== "string" || !uidPattern.test(identity.uid)
          || typeof identity.email !== "string" || !emailPattern.test(identity.email)) return reply(403);
      const { uid, email } = identity;
      if (request.method === "PUT" && !(keysFrom(env) && readerConfigured(env))) return reply(503);

      let deviceId;
      let subscription;
      try {
        if (request.method === "GET") {
          deviceId = url.searchParams.get("deviceId");
        } else {
          if (Number(request.headers.get("Content-Length")) > maxBodyBytes) return reply(413);
          const data = await readBody(request);
          deviceId = data.deviceId;
          if (request.method === "PUT") {
            subscription = parseSubscription(data.subscription);
            if (!subscription) return reply(400);
          }
        }
      } catch (error) {
        return reply(error.message === "request_too_large" ? 413 : 400);
      }
      if (typeof deviceId !== "string" || !deviceIdPattern.test(deviceId)) return reply(400);
      try {
        const reminder = env.MEAL_REMINDERS.getByName(JSON.stringify([uid, deviceId]));
        const result = await reminder.fetch("https://meals.internal/registration", {
          method: request.method,
          body: request.method === "PUT" ? JSON.stringify({ uid, email, subscription }) : undefined,
        });
        if (!result.ok) return reply(503);
        return request.method === "GET" ? reply(200, await result.json()) : reply(204);
      } catch { return reply(503); }
    },
  };
}

const mealLabels = { breakfast: "朝食", lunch: "昼食", dinner: "夕食" };

async function deliverMealReminder(subscription, { date, mealType }, env) {
  const keys = keysFrom(env);
  if (!keys) throw new Error("push_sender_unavailable");
  const notification = {
    web_push: 8030,
    mealType,
    date,
    notification: {
      title: "BodyMake",
      body: mealLabels[mealType] + "を登録しましょう。",
      tag: `bodymake-meal-${date}-${mealType}`,
      navigate: `${testOrigin}/meals/`,
      silent: false,
    },
  };
  const details = generateRequestDetails(subscription, JSON.stringify(notification), {
    vapidDetails: { subject: testOrigin, ...keys },
    contentEncoding: "aes128gcm",
    TTL: 120,
    topic: date.replaceAll("-", "") + "-" + mealType,
  });
  const response = await fetch(details.endpoint, {
    method: "POST",
    headers: details.headers,
    body: details.body,
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if ([404, 410].includes(response.status)) return "expired";
  if (!response.ok) throw new Error("push_delivery_failed");
  return "sent";
}

export class MealReminders {
  constructor(state, env, { now = Date.now, hasMeal, deliver = deliverMealReminder } = {}) {
    this.storage = state.storage;
    this.env = env;
    this.now = now;
    this.hasMeal = hasMeal;
    this.deliver = deliver;
  }

  async fetch(request) {
    if (new URL(request.url).pathname !== "/registration") return new Response(null, { status: 404 });
    if (request.method === "GET") return Response.json({ enabled: Boolean(await this.storage.get("registration")) });
    if (request.method === "DELETE") {
      await this.removeRegistration();
    } else if (request.method === "PUT") {
      const { uid, email, subscription } = await request.json();
      await this.storage.transaction(async () => {
        const active = await this.storage.get("registration");
        const due = active?.due ?? nextMealReminder(this.now());
        // Same endpoint and keys make re-enrollment an idempotent operation.
        if (active && active.email === email && JSON.stringify(active.subscription) === JSON.stringify(subscription)) return;
        await this.storage.put("registration", { uid, email, subscription, due, id: crypto.randomUUID() });
        await this.storage.setAlarm(due.at);
      });
    } else return new Response(null, { status: 405 });
    return new Response(null, { status: 204 });
  }

  async removeRegistration(id) {
    await this.storage.transaction(async () => {
      if (id !== undefined && (await this.storage.get("registration"))?.id !== id) return;
      await this.storage.delete("registration");
      await this.storage.deleteAlarm();
    });
  }

  async alarm() {
    const time = this.now();
    // Claim a slot and reserve the next one before outgoing requests. The alarm
    // can be retried after a storage failure without sending a duplicate push.
    const registration = await this.storage.transaction(async () => {
      const active = await this.storage.get("registration");
      if (!active) return null;
      if (active.due.at > time) {
        await this.storage.setAlarm(active.due.at);
        return null;
      }
      const due = nextMealReminder(time);
      await this.storage.put("registration", { ...active, due });
      await this.storage.setAlarm(due.at);
      return active;
    });
    if (!registration || time - registration.due.at > maxDelayMs) return;
    const { uid, email, due, subscription, id } = registration;

    let approved;
    let outcome;
    try {
      this.hasMeal ??= createMealPresenceReader({ credentials: this.env.MEAL_READER_CREDENTIALS });
      approved = await this.hasMeal.isAllowed(email);
      if (approved === true) {
        if ((await this.storage.get("registration"))?.id !== id || this.now() - due.at > maxDelayMs) return;
        if (await this.hasMeal(uid, due.date, due.mealType) !== false) return;
        // A disable or change may have arrived while the Firestore query ran.
        if ((await this.storage.get("registration"))?.id !== id || this.now() - due.at > maxDelayMs) return;
        outcome = await this.deliver(subscription, due, this.env);
      }
    } catch {
      // On uncertain meal status, skip the reminder. A push with an uncertain
      // response is not retried, even if the provider received it.
      return;
    }
    if (approved === false || outcome === "expired") await this.removeRegistration(id);
  }
}

export default createMealReminderWorker();
