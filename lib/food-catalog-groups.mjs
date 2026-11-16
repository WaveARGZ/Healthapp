/** @typedef {import("../types/food-database").FoodLibraryItem} FoodLibraryItem */

/** @typedef {{ name: string, variants: FoodLibraryItem[] }} FoodGroup */

function normalize(value) {
  return value.normalize("NFKC").toLocaleLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60))
    .replace(/[ーｰ]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const searchTerms = [
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
  ["鶏むね肉", "鶏胸肉", "とりむね", "とりむね肉", "チキンブレスト"],
  ["卵焼き", "玉子焼き", "たまご焼き", "厚焼き玉子", "厚焼きたまご"],
  ["焼きそば", "やきそば"],
  ["目玉焼き", "めだまやき"],
];

const synonymSets = searchTerms.map((set) => [...new Set(set.map(normalize))]);
const displayTerms = new Map(searchTerms.flatMap((set) => set.map((word) => [normalize(word), word])));

const synonyms = new Map(synonymSets.flatMap((set) => set.map((word) => [word, set])));
const riceSynonyms = synonyms.get(normalize("ごはん"));
const indexCache = new WeakMap();
const alternativesCache = new Map();

/** @param {FoodLibraryItem} food */
function indexFor(food) {
  let index = indexCache.get(food);
  if (!index) {
    index = {
      name: normalize(food.name),
      aliases: normalize(food.aliases),
      aliasWords: food.aliases.split(/\s+/).map(normalize).filter(Boolean),
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

function relatedSynonymTerms(foods, tokens, category) {
  const visibleFoods = category === "すべて" ? foods : foods.filter((food) => food.category === category);
  const terms = [];
  const seen = new Set(tokens);
  for (const token of tokens) {
    for (const alternative of alternativesFor(token, false)) {
      if (seen.has(alternative)) continue;
      if (!visibleFoods.some((food) => indexFor(food).name.includes(alternative) || indexFor(food).aliases.includes(alternative))) continue;
      terms.push(displayTerms.get(alternative) ?? alternative);
      seen.add(alternative);
      if (terms.length === 4) return terms;
    }
  }
  return terms;
}

// When a combined food name is absent, find its longest searchable parts.
function relatedParts(foods, query, category) {
  const normalized = normalize(query);
  if (normalized.length < 4 || normalized.length > 24) return [];
  const visibleFoods = category === "すべて" ? foods : foods.filter((food) => food.category === category);
  const candidates = [];
  for (let start = 0; start < normalized.length; start += 1) {
    for (let end = start + 2; end <= normalized.length; end += 1) {
      const word = normalized.slice(start, end);
      if (word === normalized) continue;
      let matches = 0;
      let wholeWord = false;
      for (const food of visibleFoods) {
        const index = indexFor(food);
        if (!index.name.includes(word) && !index.aliasWords.some((alias) => alias.includes(word))) continue;
        matches += 1;
        if (index.name === word || index.aliasWords.includes(word)) wholeWord = true;
        if (matches >= 2) break;
      }
      if (matches >= 2 || (matches > 0 && (wholeWord || synonyms.has(word)))) {
        candidates.push({ word, start, end });
      }
    }
  }
  candidates.sort((left, right) => right.word.length - left.word.length || left.start - right.start);
  const selected = [];
  for (const candidate of candidates) {
    if (selected.some((part) => candidate.start < part.end && part.start < candidate.end)) continue;
    selected.push(candidate);
    if (selected.length === 3) break;
  }
  // A stray word such as "食品" should not turn an otherwise unrelated query into matches.
  if (selected.reduce((length, part) => length + part.word.length, 0) / normalized.length < 0.6) return [];
  return selected.sort((left, right) => left.start - right.start);
}

function displayPart(query, word) {
  const original = query.normalize("NFKC");
  for (let start = 0; start < original.length; start += 1) {
    for (let end = start + 1; end <= original.length; end += 1) {
      const part = original.slice(start, end);
      if (normalize(part) === word) return part;
    }
  }
  return displayTerms.get(word) ?? word;
}

function relatedFoodScore(food, parts) {
  const index = indexFor(food);
  let count = 0;
  let length = 0;
  let firstPart = false;
  for (const [position, part] of parts.entries()) {
    if (!index.name.includes(part.word) && !index.aliasWords.some((alias) => alias.includes(part.word))) continue;
    count += 1;
    length += part.word.length;
    if (position === 0) firstPart = true;
  }
  return count ? 100 - count * 20 - length - (firstPart ? 5 : 0) + (food.id.startsWith("mext-") ? 6 : 0) : Infinity;
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
 * Exact names and equivalent names rank ahead of partial matches. When no food matches,
 * suggest searchable parts of a combined query without inventing a nutrition entry.
 *
 * @param {readonly FoodLibraryItem[]} foods
 * @param {string} query
 * @param {string} category
 * @returns {{ groups: FoodGroup[], matchingRecords: number, usedFuzzy: boolean, usedRelated: boolean, relatedTerms: string[] }}
 */
export function searchFoodGroups(foods, query, category) {
  const tokens = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (tokens.length === 0) return { ...collectGroups(foods, category, () => 0), usedFuzzy: false, usedRelated: false, relatedTerms: [] };

  const synonymTerms = relatedSynonymTerms(foods, tokens, category);

  const direct = collectGroups(foods, category, (food) => scoreFood(food, tokens, false));
  if (direct.groups.length > 0) return { ...direct, usedFuzzy: false, usedRelated: false, relatedTerms: synonymTerms };

  const combined = tokens.join("");
  if (combined.length < 3 || combined.length > 24) return { ...direct, usedFuzzy: false, usedRelated: false, relatedTerms: synonymTerms };
  if (tokens.length === 1) {
    const nearSynonym = collectGroups(foods, category, (food) => scoreFood(food, tokens, true));
    if (nearSynonym.groups.length > 0) return { ...nearSynonym, usedFuzzy: true, usedRelated: false, relatedTerms: synonymTerms };
  }

  const limit = combined.length >= 7 ? 2 : 1;
  const candidateNames = [...new Set(foods.filter((food) => category === "すべて" || food.category === category).map((food) => food.name))]
    .map((name) => ({ name, distance: substringDistance(combined, normalize(name)) }))
    .filter(({ name, distance }) => distance <= limit && normalize(name).includes(combined[0]))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 12);
  const fullLengthNames = candidateNames.filter(({ name }) => normalize(name).length >= combined.length);
  if (fullLengthNames.length > 0) {
    const fullLengthScores = new Map(fullLengthNames.map(({ name, distance }) => [name, 100 + distance]));
    const fuzzy = collectGroups(foods, category, (food) => fullLengthScores.get(food.name) ?? Infinity);
    return { ...fuzzy, usedFuzzy: true, usedRelated: false, relatedTerms: synonymTerms };
  }

  const parts = relatedParts(foods, query, category);
  if (parts.length > 0) {
    const related = collectGroups(foods, category, (food) => relatedFoodScore(food, parts));
    const relatedTerms = [...new Set([...parts.map((part) => displayPart(query, part.word)), ...synonymTerms])].slice(0, 4);
    return { ...related, usedFuzzy: false, usedRelated: true, relatedTerms };
  }
  const nameScores = new Map(candidateNames.map(({ name, distance }) => [name, 100 + distance]));
  const fuzzy = collectGroups(foods, category, (food) => nameScores.get(food.name) ?? Infinity);
  return { ...fuzzy, usedFuzzy: candidateNames.length > 0, usedRelated: false, relatedTerms: synonymTerms };
}
