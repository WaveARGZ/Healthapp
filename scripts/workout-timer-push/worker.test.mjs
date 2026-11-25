import assert from "node:assert/strict";
import test from "node:test";
import { createECDH, randomBytes } from "node:crypto";
import { generateVAPIDKeys } from "web-push";
import { createRestPushWorker, WorkoutRestTimer } from "./worker.mjs";

const origin = "https://bodymake-test-14a3f.web.app";
const startedAt = 1_790_000_000_000;
const endsAt = startedAt + 30_000;
const deviceId = "01234567-89ab-cdef-0123-456789abcdef";
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test",
  keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
};
const rest = { deviceId, startedAt, endsAt, subscription };
const keys = { publicKey: "A".repeat(87), privateKey: "A".repeat(43) };
const browserRequest = (method, body, url = origin) => new Request("https://worker.example/rest-timer", {
  method, headers: { Origin: url }, body: JSON.stringify(body),
});

test("only authenticated shared test users can schedule on an approved Web Push endpoint", async () => {
  const changes = [];
  const env = { REST_VAPID_KEYS: JSON.stringify(keys), REST_TIMERS: {
    getByName(name) {
      assert.equal(name, JSON.stringify(["tester", deviceId]));
      return { fetch: async (_url, init) => { changes.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); } };
    },
  } };
  const worker = createRestPushWorker({ authorize: async () => "tester", now: () => startedAt });
  const anonymous = createRestPushWorker({ authorize: async () => null, now: () => startedAt });
  assert.equal((await anonymous.fetch(browserRequest("PUT", rest), env)).status, 403);
  assert.equal((await worker.fetch(browserRequest("PUT", rest, "https://healthapp-14a3f.web.app"), env)).status, 403);
  assert.equal((await worker.fetch(browserRequest("PUT", { ...rest, subscription: { ...subscription, endpoint: "http://127.0.0.1" } }), env)).status, 400);
  assert.equal((await worker.fetch(browserRequest("PUT", rest), env)).status, 204);
  assert.equal((await worker.fetch(browserRequest("DELETE", { deviceId, startedAt }), env)).status, 204);
  assert.deepEqual(changes, [
    { startedAt, scheduled: { endsAt, subscription } },
    { startedAt, scheduled: null },
  ]);
});

test("the durable alarm delivers at the deadline without an open page and discards cancelled or stale reservations", async () => {
  let value;
  let alarmAt;
  let now = startedAt;
  const seen = [];
  const state = { storage: {
    get: async () => value,
    put: async (_key, next) => { value = next; },
    setAlarm: async (date) => { alarmAt = date; },
    deleteAlarm: async () => { alarmAt = undefined; },
  } };
  const timer = new WorkoutRestTimer(state, {}, { now: () => now, deliver: async (item) => seen.push(item.startedAt) });
  const send = (id, data) => timer.fetch(new Request("https://timer.internal", { method: data ? "PUT" : "DELETE", body: JSON.stringify({ startedAt: id, scheduled: data }) }));
  await send(startedAt, { endsAt, subscription });
  assert.equal(alarmAt, endsAt);
  await send(startedAt, null);
  await send(startedAt, { endsAt, subscription });
  assert.equal(alarmAt, undefined);
  await send(startedAt + 1, { endsAt, subscription });
  await timer.alarm();
  assert.deepEqual(seen, []);
  now = endsAt;
  await timer.alarm();
  await timer.alarm();
  assert.deepEqual(seen, [startedAt + 1]);
  assert.equal(value.scheduled, null);
  await send(startedAt + 2, { endsAt, subscription });
  now = endsAt + 121_000;
  await timer.alarm();
  assert.deepEqual(seen, [startedAt + 1]);
  assert.equal(value.scheduled, null);
});

test("scheduled delivery encrypts a notification and uses a short delivery lifetime", async (t) => {
  const device = createECDH("prime256v1");
  const p256dh = device.generateKeys().toString("base64url");
  let record = {
    startedAt,
    scheduled: { endsAt, subscription: { endpoint: subscription.endpoint, keys: { p256dh, auth: randomBytes(16).toString("base64url") } } },
  };
  const network = t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, subscription.endpoint);
    const headers = new Headers(request.headers);
    assert.match(headers.get("authorization"), /^vapid /i);
    assert.equal(headers.get("content-encoding"), "aes128gcm");
    assert.equal(headers.get("ttl"), "60");
    assert.ok(request.body.length > 100);
    return new Response(null, { status: 201 });
  });
  const state = { storage: { get: async () => record, put: async (_key, value) => { record = value; } } };
  const timer = new WorkoutRestTimer(state, { REST_VAPID_KEYS: JSON.stringify(generateVAPIDKeys()) }, { now: () => endsAt });
  await timer.alarm();
  assert.equal(network.mock.callCount(), 1);
  assert.equal(record.scheduled, null);
});
