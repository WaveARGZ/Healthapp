import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

// Use --test for build:test. The default also supports a GitHub Pages export.
// Both the root route and /bodymake render the BodyMake landing page.
const outputDir = process.argv.includes("--test") ? ".next-test" : "out";
const pages = ["", "bodymake", "food-photo", "dashboard", "weekly-review", "workouts", "meals", "progress", "weight", "photos", "settings", "login", "signup", "onboarding", "onboarding/photos", "auth/callback"];
const appPages = new Set(["dashboard", "weekly-review", "workouts", "meals", "progress", "weight", "photos", "settings"]);
const manifest = JSON.parse(await readFile(resolve(outputDir, "manifest.webmanifest"), "utf8"));
const basePath = manifest.scope.replace(/\/$/, "");
const imagePaths = new Set();

for (const page of pages) {
  const source = await readFile(resolve(outputDir, page, "index.html"), "utf8");
  // Check rendered markup rather than text embedded in React's hydration payload.
  const html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  if (page === "" || page === "bodymake") {
    assert.match(html, /理想の身体を、/, "root: BodyMake landing page");
    assert.doesNotMatch(html, /PORTFOLIO|わべ/, "root: portfolio removed");
    for (const [route, label] of [["signup", "記録をはじめる"], ["food-photo", "食事写真AIを無料で試す"]]) {
      const link = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].find(([, attributes, content]) =>
        attributes.includes(`href="${basePath}/${route}/"`) && content.includes(label)
      );
      assert.ok(link, `landing: ${label} opens /${route}`);
    }
    assert.match(html, /<section[^>]*id="features"/, "landing: feature navigation has a destination");
  }
  if (page === "food-photo") {
    assert.match(html, /食事写真AIを試す/, "food-photo: public analyzer title");
    assert.match(html, /アカウント不要で解析/, "food-photo: anonymous local analysis");
    assert.match(html, /学習用の共有は任意|このテスト環境では学習データの共有を行いません/, "food-photo: explains whether photos can be shared");
    assert.match(html, /写真をアルバムから選ぶ/, "food-photo: mobile photo library picker");
    assert.match(html, /カメラで撮影/, "food-photo: mobile camera picker");
    assert.match(html, /<input[^>]*type="file"[^>]*accept="image\/\*"(?![^>]*capture=)[^>]*>/, "food-photo: library picker does not force camera capture");
    assert.doesNotMatch(html, /ログイン状態を確認しています/, "food-photo: no app account gate");
    assert.match(html, /data-food-photo-startup="pending"/, "food-photo: SSR must explain that controls are not interactive yet");
    assert.match(html, /<a[^>]*href="\.\/\?reload=food-photo-startup-v1"[^>]*>操作できないときは、ページを読み直す<\/a>/, "food-photo: boot recovery must be a native link, not a JS-only button");
    if (!html.includes("このテスト環境では学習データの共有を行いません")) {
      assert.match(html, /<a[^>]*href="\.\/\?reload=food-photo-connection-v1"[^>]*>再接続<\/a>/, "food-photo: reconnect can navigate even before hydration");
    }
  }
  const cloudGate = appPages.has(page) && html.includes("ログイン状態を確認しています");
  assert.match(html, /<html[^>]*lang="ja"/, `${page}: Japanese document`);
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, `${page}: one page title`);
  const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1];
  assert.ok(viewport, `${page}: mobile viewport`);
  assert.match(viewport, /width=device-width/);
  assert.match(viewport, /viewport-fit=cover/);
  assert.match(viewport, /interactive-widget=resizes-content/);
  assert.doesNotMatch(viewport, /user-scalable=no|maximum-scale=1(?:,|$)/, `${page}: zoom remains available`);
  const logo = html.match(/<a[^>]*aria-label="BodyMake ホーム"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(logo, `${page}: brand link`);
  const image = logo[1].match(/<img[^>]*src="([^"]+)"/);
  assert.ok(image, `${page}: supplied logo is an image, not a text placeholder`);
  assert.ok(image[1].startsWith(`${basePath}/_next/static/media/bodymake-icon-192.`), `${page}: base-path-aware logo`);
  imagePaths.add(image[1]);
  await stat(resolve(outputDir, image[1].slice(basePath.length + 1)));
  assert.doesNotMatch(html, /WORKOUT LOG|MEAL LOG|CURRENT WEIGHT|your body, your pace/);
  if (appPages.has(page) && !cloudGate) {
    const nav = html.match(/<nav[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, `${page}: navigation`);
    assert.equal((nav.match(/<a /g) ?? []).length, 5, `${page}: five destinations`);
    assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1, `${page}: active destination`);
  }
  if (["workouts", "meals", "weight"].includes(page) && !cloudGate) {
    assert.match(html, /<main[^>]*data-recording="true"/, `${page}: content clears the dock`);
  }
  if (page === "workouts" && !cloudGate) {
    assert.match(html, /<h2[^>]*>筋トレカレンダー<\/h2>/, "workouts: recording starts from the calendar");
    assert.match(html, /<button[^>]*id="workout-day-\d{4}-\d{2}-\d{2}"/, "workouts: calendar dates are buttons");
    assert.match(html, /<button[^>]*aria-label="今日の筋トレを登録"/, "workouts: today's entry shortcut");
    assert.doesNotMatch(html, /<form\b/, "workouts: entry form opens after a day is selected");
  }
  if (page === "meals" && !cloudGate) {
    assert.match(html, /<input[^>]*type="date"/, "meals: choose the recording date");
    for (const label of ["朝食", "昼食", "夕食", "間食"]) {
      assert.ok(html.includes(`aria-label="${label}に食品を追加"`), `meals: ${label} has an add action`);
    }
    assert.doesNotMatch(html, /<form\b/, "meals: choose a meal before opening the composer");
  }
  if (page === "weight" && !cloudGate) {
    const form = html.match(/<form\b[\s\S]*?<\/form>/)?.[0];
    assert.ok(form, "weight: record form");
    assert.match(form, /data-record-actions="true"/, "weight: save action remains in its form");
    assert.equal((form.match(/type="submit"/g) ?? []).length, 1, "weight: one native submit control");
  }
  if (page === "dashboard" && !cloudGate) {
    const entries = html.match(/<section[^>]*aria-labelledby="record-status-title"[\s\S]*?<\/section>/)?.[0];
    assert.ok(entries, "dashboard: daily recording actions are grouped");
    for (const route of ["workouts", "meals", "weight"]) {
      assert.ok(entries.includes(`href="${basePath}/${route}/"`), `dashboard: direct link to /${route}`);
    }
  }
  if (page === "weekly-review" && !cloudGate) {
    assert.match(html, /<select[^>]*id="weekly-review-week"/, "weekly-review: choose a recording week");
  }
  if (page === "login") assert.match(html, /ログイン.*記憶/, "login: remember-session option");
  if (page === "login" && html.includes("Googleアカウントで記録を続けられます。")) {
    assert.equal(manifest.start_url, `${basePath}/dashboard`, "Firebase install opens the guarded home screen");
  }
  if (page === "settings" && !cloudGate) assert.match(html, /共有Driveへの学習データ保存/, "settings: shared Drive training-data setup");
}
assert.equal(imagePaths.size, 1, "all pages use the same artwork");
console.log(`${pages.length} pages validated: Japanese headings, logo, navigation, mobile viewport and recording controls. Base path: ${basePath || "/"}`);
