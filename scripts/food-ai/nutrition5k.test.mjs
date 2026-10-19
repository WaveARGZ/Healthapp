import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { BASE_URL, collectNutrition5k, download, officialUrl, parseCsv, parseDishMetadata, parseOptions, parseSplits } from "./collect-nutrition5k.mjs";

const line = (id) => `${id},100.5,200,1.5,20,5,ingr_0000000026,white rice,200,100.5,1.5,20,5\n`;
const id1 = "dish_1556572657"; const id2 = "dish_1556573514";

test("Nutrition5kは実配布の6+7列形式を検証し、重量とPFCを混ぜない", () => {
  const [dish] = parseDishMetadata(line(id1), "cafe1.csv");
  assert.equal(dish.massGrams, 200); assert.equal(dish.caloriesKcal, 100.5);
  assert.equal(dish.proteinGrams, 5); assert.equal(dish.carbohydrateGrams, 20);
  assert.equal(dish.ingredients[0].id, "ingr_0000000026");
  assert.equal(parseDishMetadata(line(id1).replace(",white rice,", ",,"), "source")[0].ingredients[0].name, null);
  assert.deepEqual(parseCsv('"rice, brown","a""b"\r\nx,y'), [["rice, brown", 'a"b'], ["x", "y"]]);
  for (const value of [line("../escape"), line(id1).replace(",100.5,200", ",NaN,200"), line(id1).replace(",200,100.5", ",-2,100.5"), `${id1},100,200,1,2,3,4`]) assert.throws(() => parseDishMetadata(value, "test"));
  assert.throws(() => parseCsv('"unterminated'));
});

test("Nutrition5kのsplit重複・非公式URL・過大CLI設定を拒否", () => {
  const splits = parseSplits(`${id1}\n`, id2); assert.ok(splits.train.has(id1)); assert.ok(splits.test.has(id2));
  assert.throws(() => parseSplits(id1, id1)); assert.throws(() => parseSplits("bad", ""));
  assert.ok(officialUrl(`${BASE_URL}metadata/dish_metadata_cafe1.csv`));
  for (const url of ["https://example.com/image.png", "https://storage.googleapis.com/other-bucket/a", "http://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/a", "https://user@storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/a"]) assert.equal(officialUrl(url), false);
  assert.equal(parseOptions([]).maxNew, 1000);
  for (const args of [["--max-new", "1001"], ["--max-bytes", "1000000001"], ["--max-new", "0"], ["--output"], ["--token", "secret"]]) assert.throws(() => parseOptions(args));
});

test("Nutrition5k取得はストリーミングサイズ上限と429待機を守る", async () => {
  const waits = []; let count = 0;
  const result = await download(`${BASE_URL}file`, 10, async (_url, options) => {
    assert.equal(options.redirect, "error"); count += 1;
    return count === 1 ? new Response("", { status: 429, headers: { "retry-after": "7" } }) : new Response("abc");
  }, async (ms) => waits.push(ms));
  assert.equal(result.toString(), "abc"); assert.deepEqual(waits, [7000]);
  await assert.rejects(download(`${BASE_URL}file`, 1, async () => new Response("too much"), async () => {}));
  await assert.rejects(download("https://example.com/private", 100, async () => { throw new Error("should not request"); }));
});

test("Nutrition5kは正解栄養値・公式split・出典を残し、追加だけを継続収集する", async () => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "bodymake-nutrition5k-")));
  try {
    const png1 = await sharp({ create: { width: 32, height: 32, channels: 3, background: "red" } }).png().toBuffer();
    const png2 = await sharp({ create: { width: 32, height: 32, channels: 3, background: "blue" } }).png().toBuffer();
    const photos = new Map([[id1, png1], [id2, png2]]);
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url.includes("/storage/v1/")) return Response.json({ items: [...photos].map(([id, bytes]) => ({ name: `nutrition5k_dataset/imagery/realsense_overhead/${id}/rgb.png`, size: String(bytes.length) })) });
      if (url.endsWith("cafe1.csv")) return new Response(line(id1));
      if (url.endsWith("cafe2.csv")) return new Response(line(id2));
      if (url.endsWith("ingredients_metadata.csv")) return new Response("ingredient metadata\n");
      if (url.endsWith("train_ids.txt")) return new Response(id1);
      if (url.endsWith("depth_test_ids.txt")) return new Response("");
      if (url.endsWith("test_ids.txt")) return new Response(id2);
      for (const [id, bytes] of photos) if (url.endsWith(`/${id}/rgb.png`)) return new Response(bytes);
      throw new Error(`Unexpected request: ${url}`);
    };
    const deps = { fetchImpl, wait: async () => {}, freeBytes: async () => 10_000_000_000 };
    const first = await collectNutrition5k({ output: directory, maxNew: 1, maxBytes: 1_000_000_000 }, deps);
    assert.equal(first.added, 1); assert.equal(first.total, 1); assert.equal(first.stopReason, "max-new");
    const firstRecord = JSON.parse(await readFile(path.join(directory, `records/nutrition5k-${id1}.json`)));
    assert.equal(firstRecord.labelOrigin, "dataset-provided-nutrition-metadata"); assert.equal(firstRecord.classificationLabel, null); assert.equal(firstRecord.labelVerified, false);
    assert.equal(firstRecord.nutrition.caloriesKcal, 100.5); assert.equal(firstRecord.source.license, "CC BY 4.0"); assert.deepEqual(firstRecord.officialSplit, { depth: "train", rgb: "train" });
    const callCount = calls.length;
    const second = await collectNutrition5k({ output: directory, maxNew: 1, maxBytes: 1_000_000_000 }, deps);
    assert.equal(second.added, 1); assert.equal(second.total, 2); assert.equal(calls.length - callCount, 1);
    const secondRecord = JSON.parse(await readFile(path.join(directory, `records/nutrition5k-${id2}.json`)));
    assert.deepEqual(secondRecord.officialSplit, { depth: "unassigned", rgb: "test" });
    assert.equal(secondRecord.trainingEligibility, "quarantined-no-official-overhead-split");
    const third = await collectNutrition5k({ output: directory, maxNew: 1, maxBytes: 1_000_000_000 }, deps);
    assert.equal(third.added, 0); assert.equal(third.total, 2);
    const manifest = JSON.parse(await readFile(path.join(directory, "archive-source.json")));
    assert.equal(manifest.dataset, "nutrition5k"); assert.ok(manifest.files.includes(`records/nutrition5k-${id2}.json`)); assert.ok(manifest.files.includes("metadata/dish_metadata_cafe1.csv"));
    assert.ok(!manifest.files.includes("collection-state.json"));
    await writeFile(path.join(directory, `images/nutrition5k-${id1}.png`), "tampered");
    await assert.rejects(collectNutrition5k({ output: directory, maxNew: 1, maxBytes: 1_000_000_000 }, deps), /ハッシュ/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Nutrition5kは5GB空き容量を残してネット接続前に停止", async () => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "bodymake-nutrition5k-")));
  try {
    const result = await collectNutrition5k({ output: directory, maxNew: 1, maxBytes: 1_000_000_000 }, { freeBytes: async () => 5_000_000_000, fetchImpl: async () => { throw new Error("should not fetch"); } });
    assert.equal(result.status, "stopped"); assert.equal(result.stopReason, "local-free-space-reserve"); assert.equal(result.added, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
