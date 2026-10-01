/** @typedef {import("../types/food-database").FoodLibraryItem} FoodLibraryItem */

/** @typedef {{ name: string, variants: FoodLibraryItem[] }} FoodGroup */

function normalize(value) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s・（）()、,]/g, "");
}

/**
 * Group identical Japanese display names without discarding different nutrient
 * profiles. Only truly identical original descriptions and PFC values collapse.
 * Curated foods are passed first, so they remain the first variant.
 *
 * @param {readonly FoodLibraryItem[]} foods
 * @param {string} query
 * @param {string} category
 * @returns {{ groups: FoodGroup[], matchingRecords: number }}
 */
export function searchFoodGroups(foods, query, category) {
  const tokens = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  /** @type {Map<string, FoodGroup>} */
  const groupsByName = new Map();
  /** @type {Map<string, Set<string>>} */
  const seenByName = new Map();
  let matchingRecords = 0;

  for (const food of foods) {
    if (category !== "すべて" && food.category !== category) continue;
    const searchable = normalize(`${food.name} ${food.aliases} ${food.sourceDescription ?? ""}`);
    if (!tokens.every((token) => searchable.includes(token))) continue;
    matchingRecords += 1;

    const key = food.name;
    let group = groupsByName.get(key);
    if (!group) {
      group = { name: food.name, variants: [] };
      groupsByName.set(key, group);
      seenByName.set(key, new Set());
    }
    const sourceKey = `${food.sourceDescription ?? food.id}\u0000${JSON.stringify(food.per100g)}`;
    if (seenByName.get(key)?.has(sourceKey)) continue;
    seenByName.get(key)?.add(sourceKey);
    group.variants.push(food);
  }

  return { groups: [...groupsByName.values()], matchingRecords };
}
