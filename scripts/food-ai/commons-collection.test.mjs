import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  DEFAULT_MIN_FREE_BYTES, DownloadLimitError, allowedImageUrl, atomicJson, candidateFromPage, getLicense, inspectDiskBudget,
  parseOptions, queryUrl, readBoundedBody, readJson, requestWithRetry, validateCheckpoint, validateManifest,
} from "./commons-collection.mjs";
import { COMMONS_QUERIES, COMMONS_SOURCES } from "./commons-sources.mjs";

const metadata = (license = "CC BY 4.0") => ({
  LicenseShortName: { value: license }, LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
  Artist: { value: '<a href="https://commons.wikimedia.org/wiki/User:Example">Example</a>' },
});
const page = () => ({ pageid: 17, title: "File:Sushi plate.jpg", imageinfo: [{
  url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Sushi_plate.jpg", mime: "image/jpeg", width: 512, height: 384,
  extmetadata: metadata(),
}] });

test("収集元がテスト用推論ラベルを網羅し、全てカテゴリと検索を持つ", async () => {
  const labels = JSON.parse(await readFile(new URL("../../lib/food-ai/test-photo-labels.json", import.meta.url), "utf8"));
  assert.deepEqual(COMMONS_SOURCES.map(({ id }) => id).sort(), labels.map(([id]) => id).sort());
  assert.equal(new Set(COMMONS_QUERIES.map(({ key }) => key)).size, COMMONS_QUERIES.length);
  assert.ok(COMMONS_SOURCES.every((source) => source.categories.length && source.searches.length));
});

test("--labelsは料理IDで対象を限定し、空・未知・重複の指定を拒否する", () => {
  assert.deepEqual(parseOptions(["--labels", "natto,sushi"], "/tmp").labels, ["natto", "sushi"]);
  assert.deepEqual(parseOptions(["--labels", " sushi , natto "], "/tmp").labels, ["sushi", "natto"]);
  for (const id of COMMONS_SOURCES.map(({ id }) => id)) assert.deepEqual(parseOptions(["--labels", id], "/tmp").labels, [id]);
  for (const args of [
    ["--labels"], ["--labels", "--max-new", "1"], ["--labels", ""], ["--labels", " "],
    ["--labels", ","], ["--labels", ",natto"], ["--labels", "natto,"], ["--labels", "natto, ,sushi"],
    ["--labels", "unknown"], ["--labels", "natto,unknown"], ["--labels", "納豆"], ["--labels", "NATTO"],
    ["--labels", "natto,natto"], ["--labels", "natto, natto "], ["--labels", "natto", "--labels", "sushi"],
  ]) assert.throws(() => parseOptions(args, "/tmp"), /--labels/);
});

test("CLIは回数・容量・保存先を制限し、引数の誤りを拒否する", () => {
  assert.deepEqual(parseOptions([], "/tmp/photos"), { output: "/tmp/photos", perLabel: 200, maxNew: 30, maxBytes: 1_000_000_000, minFreeBytes: DEFAULT_MIN_FREE_BYTES });
  assert.equal(parseOptions(["--per-label", "150", "--max-new", "2", "--output", "/tmp/samples"], "/tmp").perLabel, 150);
  assert.equal(parseOptions(["--per-label", "10000", "--max-new", "300", "--min-free-bytes", "6000000000"], "/tmp").minFreeBytes, 6_000_000_000);
  for (const args of [["--per-label", "10001"], ["--max-new", "0"], ["--max-new", "1001"], ["--max-bytes", "Infinity"], ["--min-free-bytes", "0"], ["--min-free-bytes", "4999999999"], ["--output"], ["--typo"]]) assert.throws(() => parseOptions(args, "/tmp"));
});

test("不足料理の別表記を候補にできても、検索語だけで正解にしない", () => {
  for (const [id, title] of [["tofu", "Hiyayakko"], ["bread", "Shokupan"], ["yogurt", "Plain yoghurt"], ["chicken-breast", "Baked chicken breast"], ["rice-fried-vegetable", "Veggie fried rice"]]) {
    const source = COMMONS_SOURCES.find((item) => item.id === id);
    assert.ok(source.searches.length > 1);
    assert.equal(source.terms.test(title), true);
    const query = COMMONS_QUERIES.find((item) => item.labelId === id && item.kind === "search");
    const candidate = candidateFromPage({ ...page(), title: `File:${title}.jpg` }, source, query);
    assert.equal(candidate.labelId, id);
    assert.equal(candidate.labelVerified, undefined);
    assert.equal(candidateFromPage({ ...page(), title: "File:Mountain.jpg" }, source, query), null);
  }
});

test("保存先の利用可能容量を確認し、最低5GBと次の保存容量を必ず残す", async () => {
  const statfsImpl = async (directory, options) => {
    assert.equal(directory, "/data"); assert.deepEqual(options, { bigint: true });
    return { bavail: 5_000_000n, bsize: 1000n, bfree: 99_000_000n };
  };
  assert.equal((await inspectDiskBudget("/data", { requiredBytes: 0, statfsImpl })).sufficient, true);
  assert.equal((await inspectDiskBudget("/data", { requiredBytes: 1, statfsImpl })).sufficient, false);
  const enough = await inspectDiskBudget("/data", { requiredBytes: 6_000_000, statfsImpl: async () => ({ bavail: 5_006_000n, bsize: 1000n }) });
  assert.deepEqual(enough, { availableBytes: 5_006_000_000, reserveBytes: 5_000_000_000, requiredBytes: 6_000_000, sufficient: true });
  await assert.rejects(inspectDiskBudget("/data", { reserveBytes: 0, statfsImpl }), /不正/);
  await assert.rejects(inspectDiskBudget("/data", { statfsImpl: async () => { throw new Error("statfs unavailable"); } }), /statfs unavailable/);
  await assert.rejects(inspectDiskBudget("/data", { statfsImpl: async () => ({ bavail: -1n, bsize: 4096n }) }), /空き容量/);
});

test("ファイル個別のライセンスと作者を保存し、不明/NC/ND/SAや不一致URLを拒否する", () => {
  assert.equal(getLicense(metadata()).author, "Example");
  for (const name of ["CC BY-SA 4.0", "CC BY-NC 4.0", "CC BY-ND 4.0", "Copyrighted", "", "CC BY 4.0 or unknown"]) assert.equal(getLicense(metadata(name)), null);
  assert.equal(getLicense({ ...metadata(), Artist: { value: "" } }), null);
  assert.equal(getLicense({ ...metadata(), LicenseUrl: { value: "https://example.com/license" } }), null);
  assert.equal(getLicense({ ...metadata(), LicenseUrl: { value: "https://creativecommons.org/licenses/by/3.0/" } }), null);
  assert.equal(getLicense({ LicenseShortName: { value: "CC0" } }).licenseUrl, "https://creativecommons.org/publicdomain/zero/1.0/");
  assert.equal(getLicense({ LicenseShortName: { value: "Public domain" } }).license, "Public domain");
});

test("候補は画像の出典を保持し、巨大画像・別料理・外部URLを拒否する", () => {
  const source = COMMONS_SOURCES.find(({ id }) => id === "sushi");
  const query = COMMONS_QUERIES.find(({ labelId }) => labelId === "sushi");
  const candidate = candidateFromPage(page(), source, query);
  assert.equal(candidate.id, "commons-17");
  assert.equal(candidate.sourceQuery.kind, "category");
  assert.equal(candidate.licenseMetadata.LicenseShortName, "CC BY 4.0");
  assert.equal(candidateFromPage({ ...page(), title: "File:Mountain.jpg" }, source, query), null);
  const huge = page(); huge.imageinfo[0].width = 100_000;
  assert.equal(candidateFromPage(huge, source, query), null);
  const external = page(); external.imageinfo[0].url = "https://example.com/image.jpg";
  assert.equal(candidateFromPage(external, source, query), null);
  for (const url of ["http://upload.wikimedia.org/a", "https://upload.wikimedia.org.evil.test/a", "https://user@upload.wikimedia.org/a"]) assert.equal(allowedImageUrl(url), false);
});

test("カテゴリと検索の継続キーをそのまま送り、チェックポイントに未処理候補を残せる", () => {
  const category = COMMONS_QUERIES[0];
  const categoryUrl = new URL(queryUrl(category, { continue: "gcmcontinue||", gcmcontinue: "123|ABC" }));
  assert.equal(categoryUrl.searchParams.get("gcmcontinue"), "123|ABC");
  assert.equal(categoryUrl.searchParams.get("maxlag"), "5");
  const searchUrl = new URL(queryUrl({ kind: "search", value: '"rice"' }, { continue: "gsroffset||", gsroffset: 10 }));
  assert.equal(searchUrl.searchParams.get("gsroffset"), "10");
  const state = { schemaVersion: 1, queries: { [category.key]: { pending: [page()], continuation: { continue: "gcmcontinue||", gcmcontinue: "123|ABC" }, complete: false } } };
  assert.equal(validateCheckpoint(state).queries[category.key].pending[0].pageid, 17);
  assert.throws(() => validateCheckpoint({ schemaVersion: 1, queries: { bad: { pending: [], complete: false, continuation: { action: "delete" } } } }));
});

test("Content-Lengthがなくてもストリーミング中に上限でキャンセルする", async () => {
  let cancelled = false;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4)); controller.enqueue(new Uint8Array(4)); }, cancel() { cancelled = true; } });
  await assert.rejects(readBoundedBody(new Response(body), 5), DownloadLimitError);
  assert.equal(cancelled, true);
  await assert.rejects(readBoundedBody(new Response("abc", { headers: { "content-length": "100" } }), 5), DownloadLimitError);
  assert.equal((await readBoundedBody(new Response("abc"), 5)).toString(), "abc");
});

test("429 Retry-AfterとAPI maxlagを待って再試行する（外部ネットワークなし）", async () => {
  const responses = [new Response("", { status: 429, headers: { "retry-after": "7" } }), Response.json({ error: { code: "maxlag" } }), Response.json({ query: { pages: {} } })];
  const waits = [];
  let calls = 0;
  const result = await requestWithRetry("https://commons.wikimedia.org/w/api.php", {
    json: true, fetchImpl: async (_url, options) => { assert.equal(options.redirect, "error"); calls += 1; return responses.shift(); }, sleep: async (ms) => waits.push(ms),
  });
  assert.deepEqual(result, { query: { pages: {} } });
  assert.deepEqual(waits, [7000, 10000]);
  assert.equal(calls, 3);
});

test("長いRetry-Afterを短縮せず終了し、404を繰り返さない", async () => {
  let calls = 0;
  await assert.rejects(requestWithRetry("https://commons.wikimedia.org/w/api.php", { fetchImpl: async () => { calls += 1; return new Response("", { status: 429, headers: { "retry-after": "120" } }); }, sleep: async () => assert.fail("should stop") }), /120 秒/);
  assert.equal(calls, 1);
  await assert.rejects(requestWithRetry("https://commons.wikimedia.org/w/api.php", { fetchImpl: async () => new Response("", { status: 404 }), sleep: async () => assert.fail("should not retry") }), /404/);
});

test("既存マニフェストの破損を無視せず、原子書き込みでJSONを保存する", async (context) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "bodymake-commons-test-"));
  context.after(() => rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, "sources.json");
  assert.deepEqual(await readJson(file, []), []);
  await writeFile(file, "{broken");
  await assert.rejects(readJson(file, []), /上書きしません/);
  assert.equal(await readFile(file, "utf8"), "{broken");
  assert.throws(() => validateManifest({}), /配列/);
  const credit = { id: "commons-17", labelId: "sushi", sha256: "a".repeat(64), license: "CC BY 4.0", sourceUrl: page().imageinfo[0].url };
  assert.throws(() => validateManifest([credit, credit]), /重複/);
  await atomicJson(file, [credit]);
  assert.deepEqual(validateManifest(await readJson(file, [])), [credit]);
});

test("取得済み写真を再取得せず中断ページの次の候補から再開し、仮ラベルを維持する", async (context) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "bodymake-commons-resume-"));
  context.after(() => rm(folder, { recursive: true, force: true }));
  const output = path.join(folder, "dataset");
  for (const [name, background] of [["first", "red"], ["second", "blue"]]) await sharp({ create: { width: 192, height: 192, channels: 3, background } }).png().toFile(path.join(folder, `${name}.png`));
  const collector = fileURLToPath(new URL("./collect-commons.mjs", import.meta.url));
  const fixture = fileURLToPath(new URL("./fixtures/commons-fetch.mjs", import.meta.url));
  async function run() {
    const child = spawn(process.execPath, ["--import", fixture, collector, "--output", output, "--max-new", "1"], { env: { ...process.env, BODYMAKE_COMMONS_TEST_DIR: folder }, stdio: ["ignore", "pipe", "pipe"] });
    let outputText = "";
    child.stdout.on("data", (chunk) => { outputText += chunk; });
    child.stderr.on("data", (chunk) => { outputText += chunk; });
    const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
    assert.equal(code, 0, outputText);
  }
  await run();
  const stateFile = path.join(output, "collection-state.json");
  const state = await readJson(stateFile, null);
  const riceQuery = COMMONS_QUERIES.find(({ key }) => key === "rice:category:Cooked rice");
  assert.equal(state.queries[riceQuery.key].pending[0].pageid, 18);
  // All other fixture sources are empty. Mark their same-day scans exhausted
  // to keep the integration test focused on continuation rather than timing.
  for (const query of COMMONS_QUERIES) if (query.key !== riceQuery.key) state.queries[query.key] = { continuation: {}, pending: [], complete: true, completedAt: new Date().toISOString() };
  await atomicJson(stateFile, state);
  await run();
  await run();
  const manifest = await readJson(path.join(output, "sources.json"), []);
  assert.deepEqual(manifest.map(({ id }) => id), ["commons-17", "commons-18"]);
  for (const id of [17, 18]) assert.equal((await readJson(path.join(output, `commons-${id}.json`), null)).labelVerified, false);
  const requests = (await readFile(path.join(folder, "requests.log"), "utf8")).trim().split("\n");
  assert.equal(requests.filter((url) => url.includes("upload.wikimedia.org")).length, 2);
  assert.equal((await readJson(path.join(output, "collection-summary.json"), null)).added, 0);
});

test("--labelsは指定料理だけを問い合わせ、対象外の継続位置と保存済みデータを保持する", async (context) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "bodymake-commons-labels-"));
  context.after(() => rm(folder, { recursive: true, force: true }));
  const output = path.join(folder, "dataset");
  await mkdir(output);
  const unselectedQueries = {
    "rice:category:Cooked rice": { continuation: { continue: "gcmcontinue||", gcmcontinue: "saved|cursor" }, pending: [page()], complete: false },
    'rice:search:"white rice" bowl': { continuation: {}, pending: [], complete: true, completedAt: "2020-01-01T00:00:00.000Z" },
  };
  const stateFile = path.join(output, "collection-state.json");
  await atomicJson(stateFile, { schemaVersion: 1, queries: unselectedQueries });
  const manifest = [{ id: "commons-17", labelId: "rice", sha256: "a".repeat(64), license: "CC BY 4.0", sourceUrl: page().imageinfo[0].url }];
  const manifestFile = path.join(output, "sources.json");
  await atomicJson(manifestFile, manifest);
  const reviewedSidecar = { id: "commons-17", confirmedFoodId: "rice", labelVerified: true };
  const sidecarFile = path.join(output, "commons-17.json");
  await atomicJson(sidecarFile, reviewedSidecar);
  const collector = fileURLToPath(new URL("./collect-commons.mjs", import.meta.url));
  const fixture = fileURLToPath(new URL("./fixtures/commons-fetch.mjs", import.meta.url));
  const child = spawn(process.execPath, ["--import", fixture, collector, "--output", output, "--labels", "natto,sushi", "--max-new", "1"], { env: { ...process.env, BODYMAKE_COMMONS_TEST_DIR: folder }, stdio: ["ignore", "pipe", "pipe"] });
  let outputText = "";
  child.stdout.on("data", (chunk) => { outputText += chunk; });
  child.stderr.on("data", (chunk) => { outputText += chunk; });
  const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
  assert.equal(code, 0, outputText);
  const requested = (await readFile(path.join(folder, "requests.log"), "utf8")).trim().split("\n");
  const selected = COMMONS_QUERIES.filter(({ labelId }) => ["natto", "sushi"].includes(labelId));
  assert.deepEqual(requested.sort(), selected.map((query) => queryUrl(query)).sort());
  const state = await readJson(stateFile, null);
  for (const [key, entry] of Object.entries(unselectedQueries)) assert.deepEqual(state.queries[key], entry);
  assert.deepEqual(Object.keys(state.queries).sort(), [...Object.keys(unselectedQueries), ...selected.map(({ key }) => key)].sort());
  assert.deepEqual(await readJson(manifestFile, null), manifest);
  assert.deepEqual(await readJson(sidecarFile, null), reviewedSidecar);
  const summary = await readJson(path.join(output, "collection-summary.json"), null);
  assert.deepEqual(summary.options.labels, ["natto", "sushi"]);
  assert.equal(summary.total, 1);
  assert.equal(summary.added, 0);
  assert.equal(summary.apiRequests, selected.length);
  assert.equal(summary.labelCounts.rice, 1);
});
