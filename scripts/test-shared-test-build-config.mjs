import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sharedTestCommand, sharedTestEnvironment, sharedTestProject } from "./shared-test-environment.mjs";

test("shared build overrides both production and test connections without mutating caller", () => {
  const input = { NEXT_PUBLIC_BODYMAKE_FIREBASE_PROJECT_ID: "healthapp-14a3f", NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_PROJECT_ID: "healthapp-14a3f", NEXT_PUBLIC_BODYMAKE_TEST_TRAINING_ENDPOINT: "https://invalid.example/production", GITHUB_ACTIONS: "true" };
  const env = sharedTestEnvironment(input);
  assert.equal(input.NEXT_PUBLIC_BODYMAKE_FIREBASE_PROJECT_ID, "healthapp-14a3f");
  assert.equal(env.NEXT_PUBLIC_BODYMAKE_FIREBASE_PROJECT_ID, "");
  assert.equal(env.NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_PROJECT_ID, sharedTestProject);
  assert.equal(env.NEXT_PUBLIC_BODYMAKE_TEST_TRAINING_ENDPOINT, "");
  assert.equal(env.NEXT_PUBLIC_BODYMAKE_TRAINING_ENDPOINT, "");
  assert.equal(env.NEXT_PUBLIC_BODYMAKE_TEST_API_URL, "");
  assert.equal(env.NEXT_PUBLIC_BODYMAKE_ENV, "test");
  assert.equal(env.NEXT_PUBLIC_BODYMAKE_SHARED_TEST, "true");
  assert.equal(env.BODYMAKE_HOSTING_TARGET, "firebase");
  assert.equal(env.NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_AUTH_DOMAIN, `${sharedTestProject}.firebaseapp.com`);
  assert.equal(env.NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_STANDALONE_AUTH_DOMAIN, `${sharedTestProject}.web.app`);
});
test("shared commands are portable and cannot dispatch arbitrary operations", () => {
  assert.equal(sharedTestCommand("dev", {}).options.shell, false);
  assert.deepEqual(sharedTestCommand("dev", {}).args.slice(1), ["dev", "--port", "3001"]);
  assert.deepEqual(sharedTestCommand("build", {}).args.slice(1), ["build", "--webpack"]);
  assert.throws(() => sharedTestCommand("deploy"));
});

test("shared test only accepts the meal reminder worker and clears inherited connections", () => {
  const env = { NEXT_PUBLIC_BODYMAKE_TEST_MEAL_REMINDER_ORIGIN: "https://production.example.test" };
  assert.equal(sharedTestEnvironment(env).NEXT_PUBLIC_BODYMAKE_TEST_MEAL_REMINDER_ORIGIN, "");
  const origin = "https://bodymake-test-meal-reminders.bodymake-team.workers.dev";
  assert.equal(sharedTestEnvironment({ BODYMAKE_TEST_MEAL_REMINDER_ORIGIN: origin }).NEXT_PUBLIC_BODYMAKE_TEST_MEAL_REMINDER_ORIGIN, origin);
  for (const invalid of [origin + "/api", "https://bodymake-timer-push.bodymake-team.workers.dev"]) {
    assert.equal(sharedTestEnvironment({ BODYMAKE_TEST_MEAL_REMINDER_ORIGIN: invalid }).NEXT_PUBLIC_BODYMAKE_TEST_MEAL_REMINDER_ORIGIN, "");
  }
});
test("staging deployment cannot target the production site or rules", async () => {
  const config = JSON.parse(await readFile("firebase.shared-test.json", "utf8"));
  assert.equal(config.hosting.site, sharedTestProject);
  assert.equal(config.hosting.public, ".next-test");
  assert.equal(config.firestore.rules, "firestore.test.rules");
});
