import { createHash } from "node:crypto";

export const SPLIT_NAMES = ["train", "validation", "test"];
export const digest = (value) => createHash("sha256").update(value).digest("hex");

/** The review must describe this exact image, independently of CLIP's prediction. */
export function hasIndependentReview(record, imageSha256) {
  const review = record.review;
  return Boolean(record.labelVerified === true && review && [undefined, "accepted"].includes(review.decision) &&
    (review.foodId === undefined || review.foodId === record.confirmedFoodId) &&
    ["human", "visual-agent"].includes(review.method) &&
    typeof review.reviewer === "string" && review.reviewer.trim().length > 0 &&
    typeof review.reviewedAt === "string" && Number.isFinite(Date.parse(review.reviewedAt)) &&
    review.imageSha256 === imageSha256);
}

export function hamming(a, b) {
  let bits = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (bits) { bits &= bits - 1n; count += 1; }
  return count;
}

export function validateSplitRegistry(registry) {
  if (!registry || registry.schemaVersion !== 1 || typeof registry.id !== "string" || !registry.id ||
    !registry.assignments || typeof registry.assignments !== "object" || Array.isArray(registry.assignments)) {
    throw new Error("分割台帳の形式が不正です。既存の台帳を削除して続行せず、バックアップを確認してください。");
  }
  for (const [hash, entry] of Object.entries(registry.assignments)) {
    if (!/^[a-f0-9]{64}$/.test(hash) || !entry || !SPLIT_NAMES.includes(entry.split) ||
      typeof entry.label !== "string" || !/^[a-f0-9]{16}$/.test(entry.dhash)) {
      throw new Error("分割台帳に不正な画像の割り当てがあります。");
    }
  }
  return registry;
}

/**
 * Remember every image hash, including removed images, to prevent an old training
 * image (or a newly downloaded near-duplicate) becoming a held-out test example.
 * Existing assignments never change. Groups that join different historical
 * splits or labels are quarantined instead of silently moving either image.
 */
export function planDatasetSplits(records, registry, { allowUnreviewed = false } = {}) {
  validateSplitRegistry(registry);
  const next = structuredClone(registry);
  const nodes = new Map(Object.entries(next.assignments).map(([hash, entry]) => [hash, { hash, dhash: entry.dhash }]));
  for (const item of records) nodes.set(item.hash, { hash: item.hash, dhash: item.dhash });
  const values = [...nodes.values()].sort((a, b) => a.hash.localeCompare(b.hash));
  const parent = values.map((_, i) => i);
  function find(index) { return parent[index] === index ? index : (parent[index] = find(parent[index])); }
  for (let i = 0; i < values.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (hamming(values[i].dhash, values[j].dhash) <= 4) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  const groupByHash = new Map();
  values.forEach((item, index) => {
    const key = find(index);
    if (!groups.has(key)) groups.set(key, { hashes: [], items: [] });
    groups.get(key).hashes.push(item.hash);
    groupByHash.set(item.hash, key);
  });
  for (const item of records) groups.get(groupByHash.get(item.hash)).items.push(item);

  const review = [];
  const eligible = [];
  for (const group of groups.values()) {
    if (!group.items.length) continue;
    const previous = group.hashes.map((hash) => next.assignments[hash]).filter(Boolean);
    const previousSplits = new Set(previous.map((entry) => entry.split));
    const labels = new Set([...previous.map((entry) => entry.label), ...group.items.map((item) => item.label)]);
    let issue = null;
    if (previousSplits.size > 1) issue = "近似画像が過去の異なる分割に重なっています。評価から除外";
    else if (labels.size > 1) issue = "同一・近似画像または過去の台帳と正解ラベルが矛盾";
    if (issue) {
      for (const item of group.items) review.push({ id: item.id, reason: issue, label: item.label });
      continue;
    }
    const usable = group.items.filter((item) => item.review?.decision !== "rejected");
    const reviewed = usable.filter((item) => item.verified);
    const candidates = allowUnreviewed ? usable : reviewed;
    for (const item of group.items.filter((item) => !item.verified)) {
      review.push({ id: item.id, reason: "独立した画像確認の記録がありません", label: item.label });
    }
    if (!candidates.length) continue;
    const representative = [...candidates].sort((a, b) => Number(b.verified) - Number(a.verified) || a.hash.localeCompare(b.hash))[0];
    eligible.push({ ...representative, groupHashes: group.hashes, previousSplit: previous[0]?.split });
  }

  const byLabel = new Map();
  for (const item of eligible) {
    if (!byLabel.has(item.label)) byLabel.set(item.label, []);
    byLabel.get(item.label).push(item);
  }
  const splits = Object.fromEntries(SPLIT_NAMES.map((name) => [name, []]));
  for (const items of byLabel.values()) {
    if (items.length < 5) {
      for (const item of items) review.push({ id: item.id, reason: "同料理の独立写真が5枚未満", label: item.label });
      continue;
    }
    const historicalCounts = Object.fromEntries(SPLIT_NAMES.map((name) => [name, items.filter((item) => item.previousSplit === name).length]));
    const sorted = [...items].sort((a, b) => digest(a.hash).localeCompare(digest(b.hash)));
    const target = { test: Math.max(1, Math.round(items.length * 0.15)), validation: Math.max(1, Math.round(items.length * 0.15)) };
    for (const item of sorted) {
      let split = item.previousSplit;
      if (!split) {
        // Fill deficits with new images only. Never reshuffle previously seen data.
        split = historicalCounts.test < target.test ? "test" : historicalCounts.validation < target.validation ? "validation" : "train";
        historicalCounts[split] += 1;
      }
      splits[split].push(item);
      for (const hash of item.groupHashes) {
        next.assignments[hash] ??= { split, label: item.label, dhash: nodes.get(hash).dhash };
      }
    }
  }
  const datasetFingerprint = digest(JSON.stringify(records.map(({ hash, label, verified, review: provenance }) =>
    ({ hash, label, verified, review: provenance ?? null })).sort((a, b) => a.hash.localeCompare(b.hash) || a.label.localeCompare(b.label))));
  return { splits, registry: next, review, independentImages: eligible.length, datasetFingerprint };
}
