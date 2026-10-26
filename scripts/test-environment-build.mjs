import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Run after build:test. The test build must render its own UI even if
// production-only public variables are present in the build environment.
const html = await readFile(".next-test/workouts/index.html", "utf8");
assert.ok(html.includes("テスト環境"), "test build is visibly identified");
if (process.argv.includes("--shared")) {
  assert.ok(html.includes("ログイン状態を確認しています"), "shared test requires its own Firebase login");
  const files = await readdir(".next-test/_next/static/chunks", { recursive: true });
  const scripts = await Promise.all(files.filter((file) => file.endsWith(".js")).map((file) => readFile(path.join(".next-test/_next/static/chunks", file), "utf8")));
  const bundle = scripts.join("\n");
  assert.ok(bundle.includes("bodymake-test-14a3f.firebaseapp.com"), "shared test uses its own Firebase login host");
  assert.ok(bundle.includes("1:282829370973:web:cc1dd833014fe13f043fb4"), "shared test uses its own Firebase app");
  assert.ok(!bundle.includes("healthapp-14a3f.firebaseapp.com"), "production Firebase auth config is absent");
  assert.ok(!bundle.includes("https://script.google.com/macros/s/"), "production training endpoint is absent");
  assert.ok(!bundle.includes("production-should-not-be-used.invalid"), "production settings are absent");
  const manifest = JSON.parse(await readFile(".next-test/food-photo.webmanifest", "utf8"));
  assert.equal(manifest.start_url, "/food-photo/");
  assert.ok(manifest.name.includes("テスト"));
  assert.ok(!html.includes('"/Healthapp/'), "Firebase is hosted at root even in GitHub Actions");
  console.log("Shared test build requires isolated Firebase login and is visibly labeled; training stays disabled.");
} else {
  assert.ok(html.includes("種目一覧から選ぶ"), "test build renders the local recording screen");
  assert.ok(!html.includes("ログイン状態を確認しています"), "production authentication is not inherited");
  console.log("Test build is labeled and does not require the production login.");
}
