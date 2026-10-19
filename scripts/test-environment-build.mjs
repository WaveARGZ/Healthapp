import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Run after build:test. The test build must render its own UI even if
// production-only public variables are present in the build environment.
const html = await readFile(".next-test/workouts/index.html", "utf8");
assert.ok(html.includes("テスト環境"), "test build is visibly identified");
assert.ok(html.includes("種目一覧から選ぶ"), "test build renders the local recording screen");
assert.ok(!html.includes("ログイン状態を確認しています"), "production authentication is not inherited");
console.log("Test build is labeled and does not require the production login.");
