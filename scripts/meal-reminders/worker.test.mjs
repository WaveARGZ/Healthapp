import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import test from "node:test";
import { generateVAPIDKeys } from "web-push";
import { nextMealReminder } from "./schedule.mjs";
import { createMealReminderWorker, MealReminders } from "./worker.mjs";

const origin = "https://bodymake-test-14a3f.web.app";
const breakfastAt = Date.parse("2026-11-25T23:00:00.000Z");
const lunchAt = Date.parse("2026-11-26T03:00:00.000Z");
const dinnerAt = Date.parse("2026-11-26T10:00:00.000Z");
const nextBreakfastAt = Date.parse("2026-11-26T23:00:00.000Z");
const deviceId = "01234567-89ab-4def-8123-456789abcdef";
const identity = { uid: "tester", email: "test@example.test" };
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test",
  keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
};
const keys = { publicKey: "A".repeat(87), privateKey: "A".repeat(43) };

function setup({ hasMeal, isAllowed = async () => true, ...options } = {}, env = {}) {
  let now = breakfastAt - 1;
  let value;
  let alarmAt;
  const storage = {
    get: async () => value,
    put: async (_key, next) => { value = structuredClone(next); },
    delete: async () => { value = undefined; },
    setAlarm: async (time) => { alarmAt = time; },
    deleteAlarm: async () => { alarmAt = undefined; },
    transaction: async (callback) => callback(),
  };
  const reader = hasMeal && Object.assign(hasMeal, { isAllowed });
  const reminder = new MealReminders({ storage }, env, { now: () => now, hasMeal: reader, ...options });
  return {
    reminder,
    moveTo: (time) => { now = time; },
    alarmAt: () => alarmAt,
    arm: () => reminder.fetch(new Request("https://meals.internal/registration", {
      method: "PUT", body: JSON.stringify({ ...identity, subscription }),
    })),
    disable: () => reminder.fetch(new Request("https://meals.internal/registration", { method: "DELETE" })),
    enabled: async () => (await (await reminder.fetch(new Request("https://meals.internal/registration"))).json()).enabled,
  };
}

test("breakfast uses the Japanese date even before UTC midnight and dinner rolls to tomorrow", () => {
  assert.deepEqual(nextMealReminder(breakfastAt - 1), { at: breakfastAt, date: "2026-11-26", mealType: "breakfast" });
  assert.deepEqual(nextMealReminder(breakfastAt), { at: lunchAt, date: "2026-11-26", mealType: "lunch" });
  assert.deepEqual(nextMealReminder(lunchAt), { at: dinnerAt, date: "2026-11-26", mealType: "dinner" });
  assert.deepEqual(nextMealReminder(dinnerAt), { at: nextBreakfastAt, date: "2026-11-27", mealType: "breakfast" });
});

test("only an authenticated device can subscribe, read status or disable", async () => {
  const { reminder } = setup();
  const objectNames = [];
  const env = { MEAL_VAPID_KEYS: JSON.stringify(keys), MEAL_REMINDERS: {
    getByName(name) {
      objectNames.push(name);
      return { fetch: (url, init) => reminder.fetch(new Request(url, init)) };
    },
  } };
  const worker = createMealReminderWorker({
    authorize: async (request) => request.headers.get("Authorization") === "Bearer fixture" ? identity : null,
    readerConfigured: () => true,
  });
  const request = (path, method, data, options = {}) => new Request("https://worker.example" + path, {
    method, body: data,
    headers: {
      Origin: options.origin ?? origin,
      "Content-Type": "application/json",
      ...(!options.anonymous && { Authorization: "Bearer fixture" }),
    },
  });
  const put = (value, options) => request("/meal-reminder", "PUT", JSON.stringify(value), options);
  const get = () => request("/meal-reminder?deviceId=" + deviceId, "GET");
  const del = () => request("/meal-reminder", "DELETE", JSON.stringify({ deviceId }));
  const getPublicKey = () => request("/public-key", "GET", undefined, { anonymous: true });
  assert.equal((await worker.fetch(getPublicKey(), {})).status, 503);
  assert.deepEqual(await (await worker.fetch(getPublicKey(), env)).json(), { publicKey: keys.publicKey });
  assert.equal((await worker.fetch(put({ deviceId, subscription }, { origin: "https://healthapp-14a3f.web.app" }), env)).status, 403);
  assert.equal((await worker.fetch(put({ deviceId, subscription }, { anonymous: true }), env)).status, 403);
  assert.equal((await worker.fetch(put({ deviceId, subscription: { ...subscription, endpoint: "https://127.0.0.1/" } }), env)).status, 400);
  assert.equal((await worker.fetch(put({ deviceId, subscription, unused: "A".repeat(4096) }), env)).status, 413);
  assert.deepEqual(await (await worker.fetch(get(), env)).json(), { enabled: false });
  assert.equal((await worker.fetch(put({ deviceId, subscription }), env)).status, 204);
  assert.deepEqual(await (await worker.fetch(get(), env)).json(), { enabled: true });
  assert.equal((await worker.fetch(del(), env)).status, 204);
  assert.deepEqual(await (await worker.fetch(get(), env)).json(), { enabled: false });
  assert.deepEqual([...new Set(objectNames)], [JSON.stringify(["tester", deviceId])]);
});

test("delivery is limited to a confirmed missing meal and a recent slot", async () => {
  const checked = [];
  const delivered = [];
  const fixture = setup({
    hasMeal: async (uid, date, mealType) => {
      checked.push([uid, date, mealType]);
      if (mealType === "dinner") throw new Error("Firestore unavailable");
      return mealType === "breakfast";
    },
    deliver: async (_subscription, due) => { delivered.push(due); return "sent"; },
  });
  await fixture.arm();
  await fixture.reminder.alarm();
  assert.equal(fixture.alarmAt(), breakfastAt);
  assert.deepEqual(checked, []);

  for (const [time, following] of [[breakfastAt, lunchAt], [lunchAt, dinnerAt], [dinnerAt, nextBreakfastAt]]) {
    fixture.moveTo(time);
    await fixture.reminder.alarm();
    await fixture.reminder.alarm();
    assert.equal(fixture.alarmAt(), following);
  }
  assert.deepEqual(checked, ["breakfast", "lunch", "dinner"].map((type) => ["tester", "2026-11-26", type]));
  assert.deepEqual(delivered, [{ at: lunchAt, date: "2026-11-26", mealType: "lunch" }]);
  fixture.moveTo(nextBreakfastAt + 121_000);
  await fixture.reminder.alarm();
  assert.equal(checked.length, 3);
  assert.equal(delivered.length, 1);
});

test("disabling during the presence check cancels the next alarm and prevents the pending push", async () => {
  const reading = Promise.withResolvers();
  const presence = Promise.withResolvers();
  const fixture = setup({
    hasMeal: () => { reading.resolve(); return presence.promise; },
    deliver: () => assert.fail("cancelled reminders do not send"),
  });
  await fixture.arm();
  fixture.moveTo(breakfastAt);
  const alarm = fixture.reminder.alarm();
  await reading.promise;
  await fixture.disable();
  presence.resolve(false);
  await alarm;
  assert.equal(await fixture.enabled(), false);
  assert.equal(fixture.alarmAt(), undefined);
});

test("confirmed access revocation removes the subscription before checking any meals", async () => {
  let revoked = false;
  const fixture = setup({
    isAllowed: async (email) => {
      assert.equal(email, identity.email);
      if (!revoked) throw new Error("temporarily unavailable");
      return false;
    },
    hasMeal: () => assert.fail("unconfirmed accounts must not look up a meal"),
    deliver: () => assert.fail("unconfirmed accounts must not send a push"),
  });
  await fixture.arm();
  fixture.moveTo(breakfastAt);
  await fixture.reminder.alarm();
  assert.equal(await fixture.enabled(), true);
  assert.equal(fixture.alarmAt(), lunchAt);

  revoked = true;
  fixture.moveTo(lunchAt);
  await fixture.reminder.alarm();
  assert.equal(await fixture.enabled(), false);
  assert.equal(fixture.alarmAt(), undefined);
});

test("expired browser subscriptions are removed on a real encrypted Web Push request", async (t) => {
  const deviceKey = createECDH("prime256v1");
  const p256dh = deviceKey.generateKeys().toString("base64url");
  const auth = randomBytes(16).toString("base64url");
  const env = { MEAL_VAPID_KEYS: JSON.stringify(generateVAPIDKeys()) };
  const fixture = setup({ hasMeal: async () => false }, env);
  const network = t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, subscription.endpoint);
    assert.equal(request.method, "POST");
    assert.equal(request.redirect, "error");
    const headers = new Headers(request.headers);
    assert.match(headers.get("authorization"), /^vapid /i);
    assert.equal(headers.get("content-encoding"), "aes128gcm");
    assert.equal(headers.get("ttl"), "120");
    assert.equal(headers.get("topic"), "20261126-breakfast");
    assert.ok(request.body.length > 100);
    return new Response(null, { status: 410 });
  });
  await fixture.reminder.fetch(new Request("https://meals.internal/registration", {
    method: "PUT", body: JSON.stringify({ ...identity, subscription: { ...subscription, keys: { p256dh, auth } } }),
  }));
  fixture.moveTo(breakfastAt);
  await fixture.reminder.alarm();
  assert.equal(network.mock.callCount(), 1);
  assert.equal(await fixture.enabled(), false);
  assert.equal(fixture.alarmAt(), undefined);
});
