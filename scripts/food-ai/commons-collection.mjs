import { randomUUID } from "node:crypto";
import { readFile, rename, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { COMMONS_SOURCES } from "./commons-sources.mjs";

export const MAX_IMAGE_BYTES = 5_000_000;
export const DEFAULT_MAX_BYTES = 1_000_000_000;
export const DEFAULT_MIN_FREE_BYTES = 5_000_000_000;
export const USER_AGENT = "BodyMakeResearchBot/0.2 (https://github.com/WaveARGZ/Healthapp)";
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const valueOf = (metadata, key) => metadata?.[key]?.value ?? "";

export function parseOptions(args, defaultOutput) {
  const options = { output: defaultOutput, perLabel: 200, maxNew: 30, maxBytes: DEFAULT_MAX_BYTES, minFreeBytes: DEFAULT_MIN_FREE_BYTES };
  const flags = {
    "--per-label": ["perLabel", 1, 10_000], "--max-new": ["maxNew", 1, 1000],
    "--max-bytes": ["maxBytes", 1_000_000, 10_000_000_000],
    "--min-free-bytes": ["minFreeBytes", DEFAULT_MIN_FREE_BYTES, 10_000_000_000_000],
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--output") {
      if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error("--output に保存先を指定してください");
      options.output = path.resolve(args[++index]);
    } else if (flag === "--labels") {
      if (options.labels) throw new Error("--labels は1回だけ指定してください");
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("--labels に料理IDをカンマ区切りで指定してください");
      const labels = value.split(",").map((id) => id.trim());
      if (labels.some((id) => !id)) throw new Error("--labels に空の料理IDは指定できません");
      if (new Set(labels).size !== labels.length) throw new Error("--labels の料理IDが重複しています");
      const knownIds = new Set(COMMONS_SOURCES.map(({ id }) => id));
      const unknown = labels.filter((id) => !knownIds.has(id));
      if (unknown.length) throw new Error(`--labels に不明な料理IDがあります: ${unknown.join(", ")}`);
      options.labels = labels;
    } else if (flags[flag]) {
      const [name, min, max] = flags[flag];
      const value = Number(args[++index]);
      if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${flag} は ${min}〜${max} の整数にしてください`);
      options[name] = value;
    } else {
      throw new Error(`不明な引数: ${flag}`);
    }
  }
  return options;
}

// Use space available to this user (bavail), not all free blocks. Failure to
// inspect the destination filesystem must stop collection, never bypass it.
export async function inspectDiskBudget(directory, { reserveBytes = DEFAULT_MIN_FREE_BYTES, requiredBytes = MAX_IMAGE_BYTES + 1_000_000, statfsImpl = statfs } = {}) {
  if (!Number.isSafeInteger(reserveBytes) || reserveBytes < DEFAULT_MIN_FREE_BYTES || !Number.isSafeInteger(requiredBytes) || requiredBytes < 0) throw new Error("空き容量の安全予算が不正です");
  const info = await statfsImpl(directory, { bigint: true });
  if (typeof info.bavail !== "bigint" || typeof info.bsize !== "bigint" || info.bavail < 0n || info.bsize <= 0n) throw new Error("保存先の空き容量を正しく取得できませんでした");
  const available = info.bavail * info.bsize;
  return {
    availableBytes: Number(available > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : available),
    reserveBytes, requiredBytes,
    sufficient: available >= BigInt(reserveBytes) + BigInt(requiredBytes),
  };
}

export function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

// The file's license, not the Commons page's text license, governs the image.
// Excludes NC, ND, SA, missing and compound/ambiguous license labels.
export function getLicense(metadata) {
  const name = stripTags(valueOf(metadata, "LicenseShortName"));
  const suppliedUrl = stripTags(valueOf(metadata, "LicenseUrl"));
  const author = stripTags(valueOf(metadata, "Artist"));
  const by = name.match(/^CC BY (1\.0|2\.0|2\.5|3\.0|4\.0)$/i);
  if (by) {
    if (!author || !/^https?:\/\/creativecommons\.org\/licenses\/by\/(?:1\.0|2\.0|2\.5|3\.0|4\.0)(?:\/|$)/i.test(suppliedUrl)) return null;
    if (!suppliedUrl.includes(`/by/${by[1]}`)) return null;
    return { license: name, licenseUrl: suppliedUrl, author };
  }
  if (/^CC0(?: 1\.0)?$/i.test(name)) return { license: name, licenseUrl: suppliedUrl || "https://creativecommons.org/publicdomain/zero/1.0/", author };
  if (/^(?:Public domain|PDM(?: 1\.0)?)$/i.test(name)) return { license: name, licenseUrl: suppliedUrl || "https://creativecommons.org/publicdomain/mark/1.0/", author };
  return null;
}

export function allowedImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname) && !url.username && !url.password && !url.port;
  } catch { return false; }
}

export function candidateFromPage(page, source, query) {
  const info = page.imageinfo?.[0];
  if (!Number.isSafeInteger(page.pageid) || page.pageid < 1 || !info || !/^image\/(jpeg|png)$/.test(info.mime ?? "")) return null;
  const description = stripTags(valueOf(info.extmetadata, "ImageDescription"));
  if (!source.terms.test(`${page.title} ${description}`)) return null;
  const license = getLicense(info.extmetadata);
  const url = info.thumburl || info.url;
  const mime = info.thumburl ? (info.thumbmime || info.mime) : info.mime;
  if (!license || !allowedImageUrl(url) || !/^image\/(jpeg|png)$/.test(mime)) return null;
  const width = info.thumburl ? info.thumbwidth : info.width;
  const height = info.thumburl ? info.thumbheight : info.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 160 || height < 160 || width * height > 4_000_000) return null;
  return {
    id: `commons-${page.pageid}`, labelId: source.id, title: page.title, mime,
    extension: mime === "image/png" ? "png" : "jpg",
    filePage: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
    ...license, sourceUrl: url, originalUrl: info.url,
    sourceQuery: { kind: query.kind, value: query.value },
    licenseMetadata: Object.fromEntries(["Artist", "LicenseShortName", "LicenseUrl", "AttributionRequired", "Copyrighted"].map((key) => [key, valueOf(info.extmetadata, key)])),
    description, commonsSha1: info.sha1 ?? null, originalTimestamp: info.timestamp ?? null,
  };
}

export function queryUrl(query, continuation = {}) {
  const params = new URLSearchParams({
    action: "query", format: "json", maxlag: "5", prop: "imageinfo", iiprop: "url|extmetadata|mime|thumbmime|size|sha1|timestamp",
    iiurlwidth: "512", iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|ImageDescription|AttributionRequired|Copyrighted",
  });
  if (query.kind === "category") {
    Object.entries({ generator: "categorymembers", gcmtitle: `Category:${query.value}`, gcmtype: "file", gcmlimit: "10", gcmsort: "timestamp", gcmdir: "descending" }).forEach(([key, value]) => params.set(key, value));
  } else {
    Object.entries({ generator: "search", gsrsearch: query.value, gsrnamespace: "6", gsrlimit: "10" }).forEach(([key, value]) => params.set(key, value));
  }
  for (const [key, value] of Object.entries(continuation)) params.set(key, String(value));
  return `https://commons.wikimedia.org/w/api.php?${params}`;
}

export function retryDelay(response, attempt, now = Date.now()) {
  const header = response?.headers.get("retry-after");
  const seconds = header === null || header === undefined ? NaN : Number(header);
  const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header ?? "") - now;
  return Math.max(5_000 * 2 ** attempt, Number.isFinite(requested) ? requested : 0);
}

export class DownloadLimitError extends Error {}

export async function readBoundedBody(response, limit = MAX_IMAGE_BYTES) {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new DownloadLimitError(`写真サイズが上限 ${limit} bytes を超えています`);
  }
  if (!response.body) throw new Error("レスポンス本文がありません");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new DownloadLimitError(`写真サイズが上限 ${limit} bytes を超えています`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, total);
}

export async function requestWithRetry(url, { json = false, maxBytes = MAX_IMAGE_BYTES, fetchImpl = fetch, sleep = delay, attempts = 4, timeoutMs = 30_000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
      if ([429, 500, 502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        if (attempt + 1 === attempts) throw new Error(`Wikimedia HTTP ${response.status}: 再試行上限`);
        const wait = retryDelay(response, attempt);
        // Do not shorten a server-requested long pause: stop this bounded run.
        if (wait > 60_000) throw new Error(`Wikimedia が ${Math.ceil(wait / 1000)} 秒後の再実行を要求しています`);
        await sleep(wait);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        const error = new Error(`Wikimedia HTTP ${response.status}`);
        error.permanent = true;
        throw error;
      }
      const bytes = await readBoundedBody(response, json ? 2_000_000 : maxBytes);
      if (!json) return bytes;
      const data = JSON.parse(bytes.toString("utf8"));
      if (data.error) {
        if (["maxlag", "ratelimited"].includes(data.error.code) && attempt + 1 < attempts) {
          const wait = retryDelay(response, attempt);
          if (wait > 60_000) throw new Error(`Wikimedia が ${Math.ceil(wait / 1000)} 秒後の再実行を要求しています`);
          await sleep(wait);
          continue;
        }
        const error = new Error(`Wikimedia API ${data.error.code}: ${data.error.info ?? ""}`);
        error.permanent = !["maxlag", "ratelimited"].includes(data.error.code);
        throw error;
      }
      return data;
    } catch (error) {
      if (response || error instanceof DownloadLimitError || error.permanent || attempt + 1 === attempts) throw error;
      await sleep(5_000 * 2 ** attempt);
    }
  }
  throw new Error("Wikimedia の取得に失敗しました");
}

export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`${file} を読み込めません。既存データは上書きしません: ${error.message}`);
  }
}

export function validateManifest(manifest) {
  if (!Array.isArray(manifest)) throw new Error("sources.json は配列である必要があります");
  const ids = new Set();
  for (const item of manifest) {
    if (!item || !/^commons-\d+$/.test(item.id) || ids.has(item.id) || typeof item.labelId !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256 ?? "") || typeof item.license !== "string" || !allowedImageUrl(item.sourceUrl)) {
      throw new Error("sources.json の形式が不正またはIDが重複しています。既存データは上書きしません");
    }
    ids.add(item.id);
  }
  return manifest;
}

export function validateCheckpoint(state) {
  if (state?.schemaVersion !== 1 || !state.queries || typeof state.queries !== "object" || Array.isArray(state.queries)) throw new Error("collection-state.json の形式が不正です");
  for (const entry of Object.values(state.queries)) {
    if (!entry || !Array.isArray(entry.pending) || typeof entry.complete !== "boolean" || !entry.continuation || typeof entry.continuation !== "object" || Array.isArray(entry.continuation)) throw new Error("収集チェックポイントの形式が不正です");
    for (const [key, value] of Object.entries(entry.continuation)) {
      if (!/^(?:continue|gcmcontinue|gsroffset|gsrcontinue|iicontinue)$/.test(key) || !["string", "number"].includes(typeof value)) throw new Error("収集チェックポイントの継続キーが不正です");
    }
  }
  return state;
}

export async function atomicWrite(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data, { flag: "wx" });
    await rename(temporary, file);
  } finally { await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
}

export const atomicJson = (file, value) => atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
