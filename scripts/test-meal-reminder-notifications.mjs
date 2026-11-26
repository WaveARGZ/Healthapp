import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("meal pushes show only the fixed meal message and open the meal log", async () => {
  const notifications = [];
  const windows = [];
  const events = new Map();
  const self = {
    location: { origin: "https://bodymake-test-14a3f.web.app" },
    registration: { showNotification: async (title, details) => { notifications.push({ title, details }); } },
    clients: { matchAll: async () => [], openWindow: async url => { windows.push(url); } },
    addEventListener: (name, listener) => events.set(name, listener),
  };
  vm.runInNewContext(await readFile("public/meal-reminder-worker.js", "utf8"), { self, URL });

  for (const [meal, label] of [["breakfast", "朝食"], ["lunch", "昼食"], ["dinner", "夕食"]]) {
    const tag = "bodymake-meal-2026-11-26-" + meal;
    let pending;
    const waitUntil = promise => { pending = promise; };
    events.get("push")({
      data: { json: () => ({ notification: { tag, body: "food details must not be used" } }) },
      waitUntil,
    });
    await pending;
    const { title, details } = notifications.at(-1);
    assert.equal(title, "BodyMake");
    assert.equal(details.body, label + "を登録しましょう。");
    assert.equal(details.tag, tag);
    assert.equal(details.silent, false);
    events.get("notificationclick")({ notification: { tag, close() {} }, waitUntil });
    await pending;
    assert.equal(windows.at(-1), "https://bodymake-test-14a3f.web.app/meals/");
  }
  events.get("push")({ data: { json: () => ({ notification: { tag: "bodymake-rest-timer" } }) } });
  assert.equal(notifications.length, 3);
});
