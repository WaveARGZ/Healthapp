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
  ["鶏肉", "鳥肉", "とりにく", "チキン", "にわとり"],
  ["鶏むね肉", "鶏胸肉", "とりむね肉", "とり胸肉", "むね肉"],
  ["鶏もも肉", "鶏腿肉", "とりもも肉", "若どりもも"],
  ["豚肉", "ぶたにく", "ポーク", "ぶた"],
  ["牛肉", "ぎゅうにく", "ビーフ"],
  ["卵", "玉子", "たまご", "タマゴ", "エッグ"],
  ["味噌汁", "みそ汁", "みそしる"],
  ["味噌", "みそ"],
  ["納豆", "なっとう"],
  ["寿司", "すし", "スシ"],
  ["海老", "えび", "エビ", "シュリンプ"],
  ["マグロ", "まぐろ", "鮪", "ツナ", "シーチキン"],
  ["鮭", "さけ", "しゃけ", "サーモン"],
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
  ["チャーハン", "炒飯", "焼き飯", "焼飯"],
  ["餃子", "ぎょうざ", "ギョーザ"],
  ["焼売", "しゅうまい", "シュウマイ"],
  ["焼きそば", "焼そば", "やきそば"],
  ["ミニトマト", "プチトマト"],
  ["卵焼き", "玉子焼き", "たまごやき", "厚焼きたまご"],
  ["ウインナー", "ウィンナー", "ソーセージ"],
  ["りんご", "林檎", "アップル"],
  ["とんかつ", "豚カツ", "豚かつ", "トンカツ"],
  ["焼き鮭", "焼鮭"],
].map((set) => [...new Set(set.map(normalize))]);

const synonyms = new Map(synonymSets.flatMap((set) => set.map((word) => [word, set])));
const compoundTerms = [...synonyms.keys()].sort((left, right) => right.length - left.length);
const riceSynonyms = synonyms.get(normalize("ごはん"));
const indexCache = new WeakMap();
const alternativesCache = new Map();

/** @param {FoodLibraryItem} food */
function indexFor(food) {
  let index = indexCache.get(food);
  if (!index) {
    const name = normalize(food.name);
    const poultryCut = name.includes("にわとり") && name.includes("むね") ? "鶏むね肉" :
      name.includes("にわとり") && name.includes("もも") ? "鶏もも肉" : "";
    index = {
      name,
      aliases: normalize(`${food.aliases} ${poultryCut}`),
      source: normalize(food.sourceDescription ?? ""),
      category: normalize(food.category),
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

function alternativesFor(token, includeNearSynonyms) {
  const cacheKey = `${token}\u0000${includeNearSynonyms}`;
  if (alternativesCache.has(cacheKey)) return alternativesCache.get(cacheKey);
  const exact = synonyms.get(token);
  let alternatives = [];
  if (exact) alternatives = exact.filter((word) => word !== token);
  else if (includeNearSynonyms && token.length >= 3) {
    const limit = token.length >= 7 ? 2 : 1;
    const near = synonymSets.filter((set) => set.some((word) => Math.abs(word.length - token.length) <= limit && wordDistance(token, word) <= limit));
    alternatives = [...new Set(near.flat())];
  }
  alternativesCache.set(cacheKey, alternatives);
  return alternatives;
}

// A query such as "鶏肉カレー" should also find "チキンカレー" even without a space.
// Only split at a known food term so unrelated substrings do not become matches.
function splitCompoundToken(token) {
  if (synonyms.has(token)) return null;
  for (const term of compoundTerms) {
    if (term.length >= token.length) continue;
    if (token.startsWith(term)) {
      const rest = token.slice(term.length).replace(/^の/, "");
      if (rest.length >= 2 || synonyms.has(rest)) return [term, rest];
    }
    if (token.endsWith(term)) {
      const rest = token.slice(0, -term.length).replace(/の$/, "");
      if (rest.length >= 2 || synonyms.has(rest)) return [rest, term];
    }
  }
  return null;
}

/** @param {FoodLibraryItem} food */
function scoreFood(food, tokens, includeNearSynonyms) {
  const index = indexFor(food);
  if (tokens.some((token) => riceSynonyms?.includes(token)) && !tokens.some((token) => token.includes("なし")) && /ごはんなし|らいすなし/.test(index.name)) return Infinity;
  let score = 0;
  for (const token of tokens) {
    let best = Infinity;
    if (index.name === token) best = 0;
    else if (index.name.startsWith(token)) best = 5;
    else if (index.name.includes(token)) best = 10;
    if (index.aliases.includes(token)) best = Math.min(best, 20);
    if (index.source.includes(token)) best = Math.min(best, 30);
    if (index.category.includes(token)) best = Math.min(best, 45);
    for (const alternative of alternativesFor(token, includeNearSynonyms)) {
      if (index.name === alternative) best = Math.min(best, 7);
      else if (index.name.startsWith(alternative)) best = Math.min(best, 30);
      else if (index.name.includes(alternative)) best = Math.min(best, 35);
      if (index.aliases.includes(alternative)) best = Math.min(best, 40);
      if (index.source.includes(alternative)) best = Math.min(best, 50);
    }
    if (best === Infinity) return Infinity;
    score += best;
  }
  return score + (food.id.startsWith("mext-") ? 6 : 0);
}

/** @param {FoodLibraryItem} food */
function scoreOrderedCompound(food, tokens) {
  const name = indexFor(food).name;
  let cursor = 0;
  for (const token of tokens) {
    let position = -1;
    let length = 0;
    for (const word of [token, ...alternativesFor(token, false)]) {
      const found = name.indexOf(word, cursor);
      if (found < 0 || (position >= 0 && found >= position)) continue;
      position = found;
      length = word.length;
    }
    if (position < 0) return Infinity;
    cursor = position + length;
  }
  return scoreFood(food, tokens, false) + 60;
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
 * Exact names and equivalent names rank ahead of partial and compound matches. Typo tolerance is only used if
 * ordinary matching returns nothing, avoiding irrelevant fuzzy results.
 *
 * @param {readonly FoodLibraryItem[]} foods
 * @param {string} query
 * @param {string} category
 * @returns {{ groups: FoodGroup[], matchingRecords: number, usedFuzzy: boolean }}
 */
export function searchFoodGroups(foods, query, category) {
  const tokens = query.trim().split(/[\s、，,・/／]+/u).map(normalize).filter(Boolean);
  if (tokens.length === 0) return { ...collectGroups(foods, category, () => 0), usedFuzzy: false };

  const compoundTokens = tokens.flatMap((token) => splitCompoundToken(token) ?? [token]);
  const hasCompound = compoundTokens.length > tokens.length;
  const direct = collectGroups(foods, category, (food) => Math.min(
    scoreFood(food, tokens, false),
    hasCompound ? scoreOrderedCompound(food, compoundTokens) : Infinity,
  ));
  if (direct.groups.length > 0) return { ...direct, usedFuzzy: false };

  const combined = tokens.join("");
  if (combined.length < 3 || combined.length > 24) return { ...direct, usedFuzzy: false };
  if (tokens.length === 1) {
    const nearSynonym = collectGroups(foods, category, (food) => scoreFood(food, tokens, true));
    if (nearSynonym.groups.length > 0) return { ...nearSynonym, usedFuzzy: true };
  }

  const limit = combined.length >= 7 ? 2 : 1;
  const candidateNames = [...new Set(foods.filter((food) => category === "すべて" || food.category === category).map((food) => food.name))]
    .map((name) => ({ name, distance: substringDistance(combined, normalize(name)) }))
    .filter(({ distance }) => distance <= limit)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 12);
  const nameScores = new Map(candidateNames.map(({ name, distance }) => [name, 100 + distance]));
  return { ...collectGroups(foods, category, (food) => nameScores.get(food.name) ?? Infinity), usedFuzzy: candidateNames.length > 0 };
}
