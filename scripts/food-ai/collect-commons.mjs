#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RawImage } from "@huggingface/transformers";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = path.join(root, "training-data/commons");
const userAgent = "BodyMakeResearchBot/0.1 (https://github.com/WaveARGZ/Healthapp)";
const sources = [
  { id: "sushi", name: "寿司", category: "Sushi", terms: /sushi|寿司|すし/i },
  { id: "ramen", name: "ラーメン", category: "Ramen", terms: /ramen|ラーメン|らーめん/i },
  { id: "curry-rice", name: "カレーライス", category: "Japanese curry", terms: /curry|カレー/i },
  { id: "pizza", name: "ピザ", category: "Pizzas", terms: /pizza|ピザ/i },
  { id: "hamburger", name: "ハンバーガー", category: "Hamburgers", terms: /hamburger|burger|ハンバーガー/i },
  { id: "salad", name: "サラダ", category: "Salads", terms: /salad|サラダ/i },
  { id: "fried-egg", name: "目玉焼き", category: "Fried eggs", terms: /fried egg|目玉焼き/i },
  { id: "potato-fries", name: "フライドポテト", category: "French fries", terms: /french fries|chips|fries|フライドポテト/i },
];
const args = process.argv.slice(2);
const amountIndex = args.indexOf("--per-label");
const perLabel = amountIndex >= 0 ? Number(args[amountIndex + 1]) : 25;
if (args.includes("--help")) {
  console.log("使い方: npm run food-ai:collect -- [--per-label 25]");
  console.log("Wikimedia Commonsの商用利用可能な写真を出典・ライセンス付きで取得します。料理名はカテゴリ由来の仮ラベルです。");
  process.exit(0);
}
if (!Number.isInteger(perLabel) || perLabel < 1 || perLabel > 100) throw new Error("--per-label は1〜100の整数にしてください");
await mkdir(outputDir, { recursive: true });
let manifest = [];
try { manifest = JSON.parse(await readFile(path.join(outputDir, "sources.json"), "utf8")); } catch { /* new dataset */ }
const savedIds = new Set(manifest.map((item) => item.id));

const acceptedLicense = /^(?:CC0(?: 1\.0)?|CC BY (?:2\.0|2\.5|3\.0|4\.0)|Public domain|PDM(?: 1\.0)?)$/i;
const valueOf = (metadata, key) => metadata?.[key]?.value ?? "";
const stripTags = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
async function getJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Wikimedia API: ${response.status}`);
  return response.json();
}
async function wait() { await new Promise((resolve) => setTimeout(resolve, 300)); }

for (const source of sources) {
  let count = manifest.filter((item) => item.labelId === source.id).length;
  let continuation = "";
  let scanned = 0;
  while (count < perLabel && scanned < 400) {
    const params = new URLSearchParams({
      action: "query", generator: "categorymembers", gcmtitle: `Category:${source.category}`,
      gcmtype: "file", gcmlimit: "50", prop: "imageinfo", iiprop: "url|extmetadata|mime",
      iiurlwidth: "512", format: "json", maxlag: "5",
    });
    if (continuation) { params.set("gcmcontinue", continuation); params.set("continue", "gcmcontinue||"); }
    const batch = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`);
    const pages = Object.values(batch.query?.pages ?? {});
    scanned += pages.length;
    for (const page of pages) {
      if (count >= perLabel) break;
      if (!source.terms.test(page.title)) continue;
      const info = page.imageinfo?.[0];
      if (!info || !/^image\/(jpeg|png)$/.test(info.mime ?? "")) continue;
      const license = stripTags(valueOf(info.extmetadata, "LicenseShortName"));
      if (!acceptedLicense.test(license)) continue;
      const url = info.thumburl || info.url;
      if (!url || !/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(url)) continue;
      const id = `commons-${page.pageid}`;
      if (savedIds.has(id)) continue;
      try {
        const response = await fetch(url, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(30000) });
        if (!response.ok || Number(response.headers.get("content-length")) > 5_000_000) continue;
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 5_000_000) continue;
        const image = await RawImage.read(new Blob([bytes], { type: info.mime }));
        if (image.width < 160 || image.height < 160) continue;
        const extension = info.mime === "image/png" ? "png" : "jpg";
        const record = {
          schemaVersion: 1, id, confirmedFoodId: source.id, confirmedFoodName: source.name,
          labelVerified: false, labelOrigin: `Wikimedia Commons Category:${source.category}`,
          createdAt: new Date().toISOString(),
        };
        const credit = {
          id, labelId: source.id, title: page.title,
          filePage: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
          author: stripTags(valueOf(info.extmetadata, "Artist")),
          license, licenseUrl: stripTags(valueOf(info.extmetadata, "LicenseUrl")),
          sourceUrl: url, sha256: createHash("sha256").update(bytes).digest("hex"),
        };
        await writeFile(path.join(outputDir, `${id}.${extension}`), bytes);
        await writeFile(path.join(outputDir, `${id}.json`), JSON.stringify(record, null, 2) + "\n");
        manifest.push(credit);
        savedIds.add(id);
        count += 1;
        await writeFile(path.join(outputDir, "sources.json"), JSON.stringify(manifest, null, 2) + "\n");
        await wait();
      } catch (error) { console.warn(`${page.title}: ${error.message}`); }
    }
    continuation = batch.continue?.gcmcontinue ?? "";
    if (!continuation) break;
    await wait();
  }
  console.log(`${source.name}: ${count}/${perLabel}枚（カテゴリ ${source.category}）`);
}
console.log(`保存先: ${outputDir}。カテゴリ名は正解保証ではなく仮ラベルです。画像ごとの出典はsources.jsonに保存しました。`);
