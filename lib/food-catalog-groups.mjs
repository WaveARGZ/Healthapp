/** @typedef {import("../types/food-database").FoodLibraryItem} FoodLibraryItem */

/** @typedef {{ name: string, variants: FoodLibraryItem[] }} FoodGroup */

function normalize(value) {
  return value.normalize("NFKC").toLocaleLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60))
    .replace(/[ーｰ]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const synonymSets = [
  ["ごはん", "ご飯", "白ごはん", "しろごはん", "白米", "白飯", "しろめし", "お米", "おこめ", "こめ", "ライス"],
  ["玄米", "げんまい"],
  ["鶏肉", "鳥肉", "とりにく", "チキン"],
  ["豚肉", "ぶたにく", "ポーク"],
  ["牛肉", "ぎゅうにく", "ビーフ"],
  ["卵", "玉子", "たまご", "タマゴ", "エッグ"],
  ["味噌汁", "みそ汁", "みそしる"],
  ["味噌", "みそ"],
  ["納豆", "なっとう"],
  ["寿司", "すし", "スシ"],
  ["海老", "えび", "エビ", "シュリンプ"],
  ["マグロ", "まぐろ", "鮪", "ツナ"],
  ["鮭", "しゃけ", "サーモン"],
  ["鯖", "さば", "サバ"],
  ["豆腐", "とうふ"],
  ["蕎麦", "そば", "ソバ"],
  ["カレー", "カリー"],
  ["パスタ", "スパゲティ", "スパゲッティ", "スパゲッティー"],
  ["じゃがいも", "ジャガイモ", "ポテト"],
  ["さつまいも", "サツマイモ"],
  ["牛乳", "ミルク"],
  ["ほうれん草", "ほうれんそう", "ホウレンソウ"],
  ["おにぎり", "おむすび"],
  ["唐揚げ", "からあげ", "から揚げ", "揚げ鶏", "フライドチキン"],
  ["焼き鳥", "やきとり"],
  ["鶏むね肉", "鶏胸肉", "とりむねにく", "とりむね", "鶏むね", "鶏胸"],
  ["鶏もも肉", "とりももにく", "とりもも", "鶏もも"],
  ["胸肉", "むね肉", "むねにく"],
  ["豚", "ぶた"],
  ["牛", "ぎゅう"],
  ["鶏", "とり"],
  ["鮭", "さけ"],
  ["親子丼", "おやこどん"],
  ["牛丼", "ぎゅうどん"],
  ["豚丼", "ぶたどん"],
  ["生姜焼き", "しょうが焼き", "しょうがやき", "生姜やき"],
  ["チャーハン", "炒飯", "焼き飯", "やきめし"],
  ["焼きそば", "焼そば", "やきそば"],
  ["焼き魚", "やきざかな"],
  ["焼き", "やき"],
  ["茹で", "ゆで"],
  ["サラダ", "さらだ"],
].map((set) => [...new Set(set.map(normalize))]);

const synonyms = new Map(synonymSets.flatMap((set) => set.map((word) => [word, set])));
const riceSynonyms = synonyms.get(normalize("ごはん"));
const indexCache = new WeakMap();
// Replace known phrases longest-first, including inside a compound dish name.
// Merge overlapping sets (e.g. 鮭/しゃけ/さけ) before choosing a canonical form.
const canonicalWords = new Map();
for (const set of synonymSets) {
  const canonical = set.map((word) => canonicalWords.get(word)).find(Boolean) ?? set[0];
  const merged = new Set(set.map((word) => canonicalWords.get(word)).filter(Boolean));
  for (const [word, value] of canonicalWords) if (merged.has(value)) canonicalWords.set(word, canonical);
  for (const word of set) canonicalWords.set(word, canonical);
}
const phrasePattern = new RegExp([...canonicalWords.keys()].sort((a, b) => b.length - a.length).join("|"), "gu");
const knownCanonicalWords = new Set(canonicalWords.values());
function canonicalize(value) {
  return normalize(value).replace(phrasePattern, (word) => canonicalWords.get(word)).replace(/の/g, "");
}

function queryTokens(query) {
  return query.normalize("NFKC").trim().split(/[\s、,・/]+/u).map(canonicalize).filter(Boolean);
}

/** @param {FoodLibraryItem} food */
function indexFor(food) {
  let index = indexCache.get(food);
  if (!index) {
    index = {
      name: normalize(food.name),
      aliases: food.aliases.split(/[\s、,]+/u).filter(Boolean).map(normalize),
      source: normalize(food.sourceDescription ?? ""),
      category: normalize(food.category),
      terms: [food.name, ...food.aliases.split(/[\s、,]+/u)].filter(Boolean).map(canonicalize),
      canonicalSource: canonicalize(food.sourceDescription ?? ""),
      fuzzyTerms: [food.name, ...food.name.split(/[\s（）()［］]+/u), ...food.aliases.split(/[\s、,]+/u)].filter(Boolean).map(canonicalize),
    };
    indexCache.set(food, index);
  }
  return index;
}

function wordDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
}

// Edit distance from the query to any substring of a display name.
function substringDistance(query, target) {
  let previous = Array(target.length + 1).fill(0);
  for (let i = 1; i <= query.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= target.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (query[i - 1] === target[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return Math.min(...previous);
}

/** @param {FoodLibraryItem} food */
function scoreFood(food, tokens) {
  const index = indexFor(food);
  if (tokens.some((token) => riceSynonyms?.includes(token)) && !tokens.some((token) => token.includes("なし")) && /ごはんなし|らいすなし/.test(index.name)) return Infinity;
  let score = 0;
  for (const token of tokens) {
    let best = Infinity;
    if (index.name === token) best = 0;
    else if (index.name.startsWith(token)) best = 5;
    else if (index.name.includes(token)) best = 10;
    if (index.aliases.some((alias) => alias.includes(token))) best = Math.min(best, 20);
    if (index.source.includes(token)) best = Math.min(best, 30);
    if (index.category.includes(token)) best = Math.min(best, 45);
    for (const [position, term] of index.terms.entries()) {
      if (term === token) best = Math.min(best, position === 0 ? 0 : 7);
      else if (term.startsWith(token)) best = Math.min(best, position === 0 ? 5 : 18);
      else if (term.includes(token)) best = Math.min(best, position === 0 ? 10 : 20);
    }
    if (index.canonicalSource.includes(token)) best = Math.min(best, 30);
    if (best === Infinity) return Infinity;
    score += best;
  }
  const phraseMatch = tokens.length > 1 && index.terms[0].includes(canonicalize(tokens.join("")));
  return score - (phraseMatch ? 15 : 0) + (food.id.startsWith("mext-") ? 6 : 0);
}

/** @param {readonly FoodLibraryItem[]} foods */
function collectGroups(foods, category, scoreFor) {
  /** @type {Map<string, FoodGroup & { score: number }>} */
  const groupsByName = new Map();
  /** @type {Map<string, Set<string>>} */
  const seenByName = new Map();
  let matchingRecords = 0;

  for (const food of foods) {
    if (category !== "すべて" && food.category !== category) continue;
    const score = scoreFor(food);
    if (!Number.isFinite(score)) continue;
    matchingRecords += 1;
    let group = groupsByName.get(food.name);
    if (!group) {
      group = { name: food.name, variants: [], score };
      groupsByName.set(food.name, group);
      seenByName.set(food.name, new Set());
    }
    group.score = Math.min(group.score, score);
    const sourceKey = `${food.sourceDescription ?? food.id}\u0000${JSON.stringify(food.per100g)}`;
    if (seenByName.get(food.name)?.has(sourceKey)) continue;
    seenByName.get(food.name)?.add(sourceKey);
    group.variants.push(food);
  }

  return { groups: [...groupsByName.values()].sort((left, right) => left.score - right.score), matchingRecords };
}

/**
 * Group identical Japanese display names without discarding different nutrient
 * profiles. Only truly identical original descriptions and PFC values collapse.
 * Reading and spelling variants also match within compound dish names.
 * Exact names and equivalent names rank ahead of partial matches. Typo tolerance is only used if
 * ordinary matching returns nothing, avoiding irrelevant fuzzy results.
 *
 * @param {readonly FoodLibraryItem[]} foods
 * @param {string} query
 * @param {string} category
 * @returns {{ groups: FoodGroup[], matchingRecords: number, usedFuzzy: boolean }}
 */
export function searchFoodGroups(foods, query, category) {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return { ...collectGroups(foods, category, () => 0), usedFuzzy: false };

  const direct = collectGroups(foods, category, (food) => scoreFood(food, tokens));
  if (direct.groups.length > 0) return { ...direct, usedFuzzy: false };

  const combined = tokens.join("");
  if (combined.length < 3 || combined.length > 24) return { ...direct, usedFuzzy: false };
  // Do not turn a correctly spelled known dish absent from the catalog into a
  // different food (牛丼 -> うどん). Keep every word required in multiword queries.
  const fuzzy = collectGroups(foods, category, (food) => {
    const index = indexFor(food);
    let score = 100;
    for (const token of tokens) {
      if (index.terms.some((term) => term.includes(token))) continue;
      if (knownCanonicalWords.has(token)) return Infinity;
      if (token.length < 4) return Infinity;
      const limit = token.length >= 8 ? 2 : 1;
      let best = Infinity;
      for (const term of index.fuzzyTerms) {
        const distance = substringDistance(token, term);
        const fullDistance = wordDistance(token, term);
        const sharedPrefix = term.startsWith(token.slice(0, 2));
        const sharedEdge = sharedPrefix || (token.length > 4 && term.endsWith(token.slice(-2)));
        if (distance <= limit && (sharedEdge || (token.length > 4 && fullDistance <= limit))) best = Math.min(best, distance * 10 + Math.min(fullDistance, 20));
      }
      if (!Number.isFinite(best)) return Infinity;
      score += best;
    }
    return score;
  });
  return { ...fuzzy, groups: fuzzy.groups.slice(0, 12), usedFuzzy: fuzzy.groups.length > 0 };
}
