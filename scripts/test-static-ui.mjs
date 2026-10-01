import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

// Run after a normal build or a GitHub Pages build. No browser data is modified.
const pages = ["", "dashboard", "workouts", "meals", "progress", "weight", "photos", "settings", "login", "signup", "onboarding", "onboarding/photos"];
const appPages = new Set(["dashboard", "workouts", "meals", "progress", "weight", "photos", "settings"]);
const manifest = JSON.parse(await readFile("out/manifest.webmanifest", "utf8"));
const basePath = manifest.scope.replace(/\/$/, "");
const imagePaths = new Set();

for (const page of pages) {
  const html = await readFile(resolve("out", page, "index.html"), "utf8");
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
  if (appPages.has(page)) {
    const nav = html.match(/<nav[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, `${page}: navigation`);
    assert.equal((nav.match(/<a /g) ?? []).length, 5, `${page}: five destinations`);
    assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1, `${page}: active destination`);
  }
  if (["workouts", "meals", "weight"].includes(page)) {
    assert.match(html, /<main[^>]*data-recording="true"/, `${page}: content clears the dock`);
    const form = html.match(/<form[\s\S]*?<\/form>/)?.[0];
    assert.ok(form, `${page}: record form`);
    assert.match(form, /data-record-actions="true"/, `${page}: save action remains in its form`);
    assert.equal((form.match(/type="submit"/g) ?? []).length, 1, `${page}: one native submit control`);
  }
}
assert.equal(imagePaths.size, 1, "all pages use the same artwork");
console.log(`${pages.length} pages validated: Japanese headings, logo, navigation, mobile viewport and recording controls. Base path: ${basePath || "/"}`);
