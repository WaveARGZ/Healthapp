/** @typedef {import("../types/food-database").FoodLibraryItem} FoodLibraryItem */

/** @typedef {{ name: string, variants: FoodLibraryItem[], inferred?: boolean, matchedTerms?: string[] }} FoodGroup */
/** @typedef {{ label: string, token: string }} NounTerm */

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
const wordSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("ja", { granularity: "word" }) : null;
const particles = new Set(["と", "の", "を", "に", "で", "が", "は", "も", "や", "へ", "から", "まで", "より", "および"]);
const genericWords = new Set(["炒", "め", "物", "焼き", "焼", "煮", "揚げ", "蒸し", "入り", "付き", "なし", "風", "味", "料理", "定食"]);
const preferredNounCategories = new Map([
  ["鶏肉", "肉類"], ["豚肉", "肉類"], ["牛肉", "肉類"], ["卵", "卵類"],
  ["トマト", "野菜類"], ["ツナ", "魚介料理"], ["サラダ", "野菜・サラダ"],
  ["おにぎり", "ごはん・穀類"], ["パスタ", "麺・パスタ"],
].map(([word, category]) => [normalize(word), category]));
const chickenSynonyms = synonyms.get(normalize("鶏肉"));
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

function conflictsWithChicken(index, token) {
  return chickenSynonyms?.includes(token) && index.name.includes("鳥肉類") && !index.name.includes("にわとり");
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

function extractNouns(query) {
  const segments = wordSegmenter ? [...wordSegmenter.segment(query)].filter((part) => part.isWordLike).map((part) => part.segment) :
    query.split(/[\s、，,・/／]+/u).filter(Boolean);
  /** @type {NounTerm[]} */
  const terms = [];
  const seen = new Set();
  let hasConnector = /[\s、，,・/／]/u.test(query);

  for (let index = 0; index < segments.length && terms.length < 6;) {
    let label = segments[index];
    let token = normalize(label);
    let consumed = 1;
    for (let length = Math.min(5, segments.length - index); length > 1; length -= 1) {
      const joined = segments.slice(index, index + length).join("");
      const compound = normalize(joined);
      if (!synonyms.has(compound)) continue;
      label = joined;
      token = compound;
      consumed = length;
      break;
    }
    index += consumed;
    if (particles.has(token)) { hasConnector = true; continue; }
    if (!token || genericWords.has(token) || /^\d+$/u.test(token)) continue;
    const split = synonyms.has(token) ? null : splitCompoundToken(token);
    const pieces = split ?? [token];
    for (const piece of pieces) {
      if (piece.length === 1 && !synonyms.has(piece)) continue;
      const key = synonyms.get(piece)?.[0] ?? piece;
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push({ label: split ? piece : label, token: piece });
      if (terms.length >= 6) break;
    }
  }
  return { terms, hasConnector };
}

/** @param {FoodLibraryItem} food */
function scoreFood(food, tokens, includeNearSynonyms) {
  const index = indexFor(food);
  if (tokens.some((token) => conflictsWithChicken(index, token))) return Infinity;
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

function scoreNoun(index, token) {
  if (conflictsWithChicken(index, token)) return Infinity;
  let best = Infinity;
  for (const [position, word] of [token, ...alternativesFor(token, false)].entries()) {
    const penalty = position === 0 ? 0 : 15;
    if (index.name === word) best = Math.min(best, penalty);
    else if (index.name.startsWith(word)) best = Math.min(best, 4 + penalty);
    else if (index.name.includes(word)) best = Math.min(best, 8 + penalty);
    if (index.aliases.includes(word)) best = Math.min(best, 18 + penalty);
    if (index.source.includes(word)) best = Math.min(best, 25 + penalty);
  }
  return best;
}

function hasNounsInOrder(name, terms) {
  let cursor = 0;
  for (const { token } of terms) {
    const positions = [token, ...alternativesFor(token, false)]
      .map((word) => ({ position: name.indexOf(word, cursor), length: word.length }))
      .filter(({ position }) => position >= 0)
      .sort((left, right) => left.position - right.position);
    if (!positions.length) return false;
    cursor = positions[0].position + positions[0].length;
  }
  return true;
}

/**
 * Related results are existing foods only. Missing nouns lower the rank, and
 * compact names keep their word order to avoid treating チキンサラダ as サラダチキン.
 * @param {readonly FoodLibraryItem[]} foods
 * @param {NounTerm[]} terms
 * @param {boolean} hasConnector
 * @param {string} category
 * @param {FoodGroup[]} directGroups
 * @returns {FoodGroup[]}
 */
function inferFoodGroups(foods, terms, hasConnector, category, directGroups) {
  if (terms.length < 2 || directGroups.length > 0) return [];
  const related = collectGroups(foods, category, (food) => {
    const index = indexFor(food);
    const matched = terms.map(({ token }) => scoreNoun(index, token));
    const matchingTerms = terms.filter((_, position) => Number.isFinite(matched[position]));
    if (!matchingTerms.length) return Infinity;
    if (!hasConnector && matchingTerms.length > 1 && !hasNounsInOrder(index.name, matchingTerms)) return Infinity;
    const missed = terms.length - matchingTerms.length;
    return missed * 100 + matched.filter(Number.isFinite).reduce((sum, score) => sum + score, 0) +
      Math.min(food.name.length, 40) / 10 + (food.id.startsWith("mext-") ? 6 : 0);
  }).groups;

  /** @type {typeof related} */
  const matchesTerm = (group, token) => group.variants.some((food) => Number.isFinite(scoreNoun(indexFor(food), token)));
  const selected = related.filter((group) => terms.filter(({ token }) => matchesTerm(group, token)).length >= 2).slice(0, 4);
  for (const { token } of terms) {
    if (selected.some((group) => matchesTerm(group, token))) continue;
    const preferred = preferredNounCategories.get(token) ?? preferredNounCategories.get(synonyms.get(token)?.[0]);
    const plainChicken = chickenSynonyms?.includes(token) ? related.find((group) => !selected.includes(group) && matchesTerm(group, token) &&
      group.variants.some((food) => food.name.includes("にわとり") && food.name.includes("若どり") && food.name.includes("むね") && food.name.includes("皮なし") && food.name.endsWith("生"))) : null;
    const next = plainChicken ?? related.find((group) => !selected.includes(group) && matchesTerm(group, token) &&
      group.variants.some((food) => food.category === preferred)) ??
      related.find((group) => !selected.includes(group) && matchesTerm(group, token));
    if (next) selected.push(next);
  }
  return selected.sort((left, right) => left.score - right.score).map((group) => ({
    ...group,
    inferred: true,
    matchedTerms: terms.filter(({ token }) => group.variants.some((food) => Number.isFinite(scoreNoun(indexFor(food), token))))
      .map(({ label }) => label),
  }));
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
 * @returns {{ groups: FoodGroup[], inferredGroups: FoodGroup[], searchTerms: string[], matchingRecords: number, usedFuzzy: boolean }}
 */
export function searchFoodGroups(foods, query, category) {
  const tokens = query.trim().split(/[\s、，,・/／]+/u).map(normalize).filter(Boolean);
  if (tokens.length === 0) return { ...collectGroups(foods, category, () => 0), inferredGroups: [], searchTerms: [], usedFuzzy: false };

  const nouns = extractNouns(query);
  const finish = (result, usedFuzzy) => ({
    ...result,
    inferredGroups: !usedFuzzy && !synonyms.has(normalize(query)) ?
      inferFoodGroups(foods, nouns.terms, nouns.hasConnector, category, result.groups) : [],
    searchTerms: nouns.terms.map(({ label }) => label),
    usedFuzzy,
  });

  const compoundTokens = tokens.flatMap((token) => splitCompoundToken(token) ?? [token]);
  const hasCompound = compoundTokens.length > tokens.length;
  const direct = collectGroups(foods, category, (food) => Math.min(
    scoreFood(food, tokens, false),
    hasCompound ? scoreOrderedCompound(food, compoundTokens) : Infinity,
  ));
  if (direct.groups.length > 0) return finish(direct, false);

  const combined = tokens.join("");
  const skipTypo = nouns.terms.length >= 2 && (nouns.hasConnector || nouns.terms.some(({ token }) => token.length === 1));
  if (combined.length < 3 || combined.length > 24 || skipTypo) return finish(direct, false);
  if (tokens.length === 1) {
    const nearSynonym = collectGroups(foods, category, (food) => scoreFood(food, tokens, true));
    if (nearSynonym.groups.length > 0) return finish(nearSynonym, true);
  }

  const limit = combined.length >= 7 ? 2 : 1;
  const candidateNames = [...new Set(foods.filter((food) => category === "すべて" || food.category === category).map((food) => food.name))]
    .map((name) => ({ name, distance: substringDistance(combined, normalize(name)) }))
    .filter(({ distance }) => distance <= limit)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 12);
  const nameScores = new Map(candidateNames.map(({ name, distance }) => [name, 100 + distance]));
  return finish(collectGroups(foods, category, (food) => nameScores.get(food.name) ?? Infinity), candidateNames.length > 0);
}
