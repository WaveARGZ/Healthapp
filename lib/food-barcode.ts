import { manufacturerBarcodeProducts } from "./data/manufacturer-barcode-products.ts";
import type { MealEntry, MealFoodItem } from "@/types/meal";

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
  suggestedNutrition?: BarcodeNutrition;
  source: NonNullable<MealFoodItem["barcodeSource"]>;
  sourceUrl?: string;
}

type FoodFactsResponse = {
  status?: string | number;
  product?: {
    code?: unknown;
    product_name?: unknown;
    product_name_ja?: unknown;
    abbreviated_product_name?: unknown;
    generic_name?: unknown;
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

function barcodeKey(code: string): string {
  return code.replace(/^0+(?=\d)/, "");
}

export function recordedBarcodeSource(item: Pick<MealFoodItem, "sourceBarcode" | "barcodeSource">) {
  const code = item.sourceBarcode && normalizeBarcode(item.sourceBarcode);
  if (!code || item.barcodeSource === "manual") return undefined;
  if (item.barcodeSource === "manufacturer") {
    const product = manufacturerBarcodeProducts[barcodeKey(code)];
    return product ? { url: product.sourceUrl, label: product.brand } : undefined;
  }
  return { url: `https://world.openfoodfacts.org/product/${code}`, label: "Open Food Facts" };
}

function readableText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nutrient(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10000
    ? value : undefined;
}

export function parseBarcodeProduct(code: string, data: FoodFactsResponse): BarcodeProduct | null {
  if (!data.product || data.status === "failure" || data.status === 0) return null;
  const product = data.product;
  const responseCode = typeof product.code === "string" ? normalizeBarcode(product.code) : null;
  if (responseCode && barcodeKey(responseCode) !== barcodeKey(code)) return null;
  const facts = product.nutriments ?? {};
  const kcal = nutrient(facts["energy-kcal_100g"]);
  const kj = nutrient(facts["energy-kj_100g"] ?? facts.energy_100g);
  const packageQuantity = readableText(product.quantity);
  const servingSize = readableText(product.serving_size);
  const liquid = /(?:\bml\b|\bcl\b|\b[0-9]+(?:\.[0-9]+)?\s*l\b|ミリリットル|リットル)/i.test(`${packageQuantity} ${servingSize}`);
  const servingQuantity = nutrient(product.serving_quantity);
  return {
    code: responseCode ?? code,
    name: readableText(product.product_name_ja) || readableText(product.product_name) || readableText(product.abbreviated_product_name) || readableText(product.generic_name),
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
    source: "open-food-facts",
    sourceUrl: `https://world.openfoodfacts.org/product/${responseCode ?? code}`,
  };
}

export function manualBarcodeProduct(code: string): BarcodeProduct {
  return { code, name: "", brand: "", packageQuantity: "", servingSize: "", suggestedAmount: 100, amountUnit: "g", per100: {}, source: "manual" };
}

function nutritionPer100({ calories, proteinG, fatG, carbsG }: BarcodeNutrition, amount: number): BarcodeNutrition {
  const normalize = (value: number | undefined) => value === undefined ? undefined : value * 100 / amount;
  return { calories: normalize(calories), proteinG: normalize(proteinG), fatG: normalize(fatG), carbsG: normalize(carbsG) };
}

export function findRecordedBarcodeProduct(code: string, meals: readonly MealEntry[]): BarcodeProduct | null {
  const key = barcodeKey(code);
  for (const meal of meals) {
    for (const item of meal.items ?? []) {
      if (!item.sourceBarcode || barcodeKey(normalizeBarcode(item.sourceBarcode) ?? "") !== key) continue;
      // Older barcode records did not store a separate volume field for liquids.
      const suffix = /[（(](\d+(?:\.\d+)?)(g|ml)[）)]$/i.exec(item.name);
      const unit = item.portionUnit ?? suffix?.[2].toLowerCase();
      const amount = item.portionQuantity ?? item.portionGrams ?? Number(suffix?.[1]);
      const hasAmount = Number.isFinite(amount) && amount > 0 && amount <= 3000 && (unit === "g" || unit === "ml");
      const { calories, proteinG, fatG, carbsG } = item;
      return {
        ...manualBarcodeProduct(code),
        name: (suffix ? item.name.slice(0, suffix.index) : item.name).trim(),
        suggestedAmount: hasAmount ? amount : 100,
        amountUnit: unit === "ml" ? "ml" : "g",
        // Nutrient totals can only be scaled when the original amount is known.
        per100: hasAmount ? nutritionPer100(item, amount) : {},
        suggestedNutrition: hasAmount ? { calories, proteinG, fatG, carbsG } : undefined,
        source: item.barcodeSource ?? "open-food-facts",
        sourceUrl: recordedBarcodeSource(item)?.url,
      };
    }
  }
  return null;
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

export function barcodeNutritionForAmount(product: BarcodeProduct, amount: number): BarcodeNutrition {
  if (product.suggestedAmount === amount && product.suggestedNutrition) return product.suggestedNutrition;
  return scaleBarcodeNutrition(product.per100, amount);
}

export async function lookupBarcodeProduct(code: string, signal?: AbortSignal): Promise<BarcodeProduct | null> {
  signal?.throwIfAborted();
  const normalized = normalizeBarcode(code);
  if (!normalized) return null;
  const manufacturerCode = barcodeKey(normalized);
  const manufacturer = manufacturerBarcodeProducts[manufacturerCode];
  if (manufacturer) {
    const { name, brand, packageAmount, unit, nutrition, sourceUrl } = manufacturer;
    return {
      code: manufacturerCode, name, brand,
      packageQuantity: `${packageAmount}${unit}`, servingSize: "", suggestedAmount: packageAmount,
      amountUnit: unit, per100: nutritionPer100(nutrition, packageAmount), suggestedNutrition: nutrition,
      source: "manufacturer", sourceUrl,
    };
  }
  const url = new URL(`https://world.openfoodfacts.org/api/v3/product/${normalized}`);
  url.searchParams.set("lc", "ja");
  url.searchParams.set("cc", "jp");
  url.searchParams.set("fields", "code,product_name,product_name_ja,abbreviated_product_name,generic_name,brands,quantity,serving_size,serving_quantity,nutriments");
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Food Facts returned ${response.status}`);
  return parseBarcodeProduct(normalized, await response.json() as FoodFactsResponse);
}
