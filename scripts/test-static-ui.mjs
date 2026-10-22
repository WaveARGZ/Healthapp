import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

// Run after a normal build or a GitHub Pages build. No browser data is modified.
// Both the root route and /bodymake render the BodyMake landing page.
const pages = ["", "bodymake", "food-photo", "dashboard", "workouts", "meals", "progress", "weight", "photos", "settings", "login", "signup", "onboarding", "onboarding/photos", "auth/callback"];
const appPages = new Set(["dashboard", "workouts", "meals", "progress", "weight", "photos", "settings"]);
const manifest = JSON.parse(await readFile("out/manifest.webmanifest", "utf8"));
const basePath = manifest.scope.replace(/\/$/, "");
const imagePaths = new Set();

for (const page of pages) {
  const html = await readFile(resolve("out", page, "index.html"), "utf8");
  if (page === "") {
    assert.match(html, /理想の身体を、/, "root: BodyMake landing page");
    assert.doesNotMatch(html, /PORTFOLIO|わべ/, "root: portfolio removed");
    assert.match(html, /食事写真AIを無料で試す/, "root: public photo entry point");
  }
  if (page === "food-photo") {
    assert.match(html, /食事写真AIを試す/, "food-photo: public analyzer title");
    assert.match(html, /アカウント不要で解析/, "food-photo: anonymous local analysis");
    assert.match(html, /学習用の共有は任意/, "food-photo: sharing is optional");
    assert.match(html, /写真をアルバムから選ぶ/, "food-photo: mobile photo library picker");
    assert.match(html, /カメラで撮影/, "food-photo: mobile camera picker");
    assert.match(html, /<input[^>]*type="file"[^>]*accept="image\/\*"(?![^>]*capture=)[^>]*>/, "food-photo: library picker does not force camera capture");
    assert.doesNotMatch(html, /ログイン状態を確認しています/, "food-photo: no app account gate");
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
  await stat(resolve("out", image[1].slice(basePath.length + 1)));
  assert.doesNotMatch(html, /WORKOUT LOG|MEAL LOG|CURRENT WEIGHT|your body, your pace/);
  if (appPages.has(page) && !cloudGate) {
    const nav = html.match(/<nav[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, `${page}: navigation`);
    assert.equal((nav.match(/<a /g) ?? []).length, 5, `${page}: five destinations`);
    assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1, `${page}: active destination`);
  }
  if (["workouts", "meals", "weight"].includes(page) && !cloudGate) {
    assert.match(html, /<main[^>]*data-recording="true"/, `${page}: content clears the dock`);
    const form = html.match(/<form[\s\S]*?<\/form>/)?.[0];
    assert.ok(form, `${page}: record form`);
    if (page === "meals") {
      assert.match(form, /メニューを追加すると、そのまま食事記録に保存されます/, "meals: add action saves directly");
      assert.equal((form.match(/type="submit"/g) ?? []).length, 0, "meals: no second submit for search mode");
    } else {
      assert.match(form, /data-record-actions="true"/, `${page}: save action remains in its form`);
      assert.equal((form.match(/type="submit"/g) ?? []).length, 1, `${page}: one native submit control`);
    }
  }
  if (page === "login") assert.match(html, /ログイン.*記憶/, "login: remember-session option");
  if (page === "login" && html.includes("Googleアカウントで記録を続けられます。")) {
    assert.equal(manifest.start_url, `${basePath}/dashboard`, "Firebase install opens the guarded home screen");
  }
  if (page === "meals" && !cloudGate) assert.match(html, /写真からメニューを追加/, "meals: photo correction entry point");
  if (page === "settings" && !cloudGate) assert.match(html, /共有Driveへの学習データ保存/, "settings: shared Drive training-data setup");
}
assert.equal(imagePaths.size, 1, "all pages use the same artwork");
console.log(`${pages.length} pages validated: Japanese headings, logo, navigation, mobile viewport and recording controls. Base path: ${basePath || "/"}`);
