const keysMatch = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

/** Exclusions record data-quality decisions without changing labels or historic splits. */
export function validateLearningExclusions(value) {
  if (!keysMatch(value, ["schemaVersion", "exclusions"]) || value.schemaVersion !== 1 || !Array.isArray(value.exclusions)) {
    throw new Error("学習除外台帳の形式が不正です");
  }
  const ids = new Set();
  for (const item of value.exclusions) {
    if (!keysMatch(item, ["id", "imageSha256", "reason", "reviewer", "reviewedAt"]) ||
      typeof item.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(item.id) || ids.has(item.id) ||
      typeof item.imageSha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.imageSha256) ||
      typeof item.reason !== "string" || !item.reason.trim() || item.reason.length > 2000 ||
      typeof item.reviewer !== "string" || !item.reviewer.trim() || item.reviewer.length > 200 ||
      typeof item.reviewedAt !== "string" || !Number.isFinite(Date.parse(item.reviewedAt)) ||
      new Date(item.reviewedAt).toISOString() !== item.reviewedAt) {
      throw new Error("学習除外台帳の画像ID・ハッシュ・理由・確認者・確認日時が不正です");
    }
    ids.add(item.id);
  }
  return value;
}

/** A stale exclusion must stop training, not silently admit a changed image. */
export function matchLearningExclusion(exclusions, id, imageSha256) {
  const item = exclusions.exclusions.find((entry) => entry.id === id);
  if (!item) return null;
  if (item.imageSha256 !== imageSha256) throw new Error(`除外指定の写真ハッシュが一致しません: ${id}`);
  return item;
}
