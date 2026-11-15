export interface BarcodeNutrition {
  calories?: number;
  proteinG?: number;
  fatG?: number;
  carbsG?: number;
}

export interface BarcodeProduct {
  code: string;
  name: string;
  brand: string;
  packageQuantity: string;
  servingSize: string;
  suggestedAmount: number;
  amountUnit: "g" | "ml";
  per100: BarcodeNutrition;
  sourceUrl: string;
}

type FoodFactsResponse = {
  status?: string;
  product?: {
    product_name?: unknown;
    product_name_ja?: unknown;
    brands?: unknown;
    quantity?: unknown;
    serving_size?: unknown;
    serving_quantity?: unknown;
    nutriments?: Record<string, unknown>;
  };
};

export function normalizeBarcode(value: string): string | null {
  const code = value.normalize("NFKC").replace(/[\s-]/g, "");
  return /^\d{8,14}$/.test(code) ? code : null;
}

function readableText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nutrient(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10000
    ? value : undefined;
}

export function parseBarcodeProduct(code: string, data: FoodFactsResponse): BarcodeProduct | null {
  if (!data.product || data.status === "failure") return null;
  const product = data.product;
  const facts = product.nutriments ?? {};
  const kcal = nutrient(facts["energy-kcal_100g"]);
  const kj = nutrient(facts["energy-kj_100g"] ?? facts.energy_100g);
  const packageQuantity = readableText(product.quantity);
  const servingSize = readableText(product.serving_size);
  const liquid = /(?:\bml\b|\bcl\b|\b[0-9]+(?:\.[0-9]+)?\s*l\b|ミリリットル|リットル)/i.test(`${packageQuantity} ${servingSize}`);
  const servingQuantity = nutrient(product.serving_quantity);
  return {
    code,
    name: readableText(product.product_name_ja) || readableText(product.product_name),
    brand: readableText(product.brands),
    packageQuantity,
    servingSize,
    suggestedAmount: servingQuantity && servingQuantity <= 3000 ? servingQuantity : 100,
    amountUnit: liquid ? "ml" : "g",
    per100: {
      calories: kcal ?? (kj === undefined ? undefined : Math.round(kj / 4.184)),
      proteinG: nutrient(facts.proteins_100g),
      fatG: nutrient(facts.fat_100g),
      carbsG: nutrient(facts.carbohydrates_100g),
    },
    sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
  };
}

export function scaleBarcodeNutrition(per100: BarcodeNutrition, amount: number): BarcodeNutrition {
  const scale = (value: number | undefined, digits: number) => value === undefined ? undefined
    : Math.round(value * amount / 100 * 10 ** digits) / 10 ** digits;
  return {
    calories: scale(per100.calories, 0),
    proteinG: scale(per100.proteinG, 1),
    fatG: scale(per100.fatG, 1),
    carbsG: scale(per100.carbsG, 1),
  };
}

export async function lookupBarcodeProduct(code: string, signal?: AbortSignal): Promise<BarcodeProduct | null> {
  const url = new URL(`https://world.openfoodfacts.org/api/v3/product/${code}`);
  url.searchParams.set("lc", "ja");
  url.searchParams.set("cc", "jp");
  url.searchParams.set("fields", "code,product_name,product_name_ja,brands,quantity,serving_size,serving_quantity,nutriments");
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Food Facts returned ${response.status}`);
  return parseBarcodeProduct(code, await response.json() as FoodFactsResponse);
}
