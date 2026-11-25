import assert from "node:assert/strict";
import test from "node:test";
import { barcodeNutritionForAmount, findRecordedBarcodeProduct, lookupBarcodeProduct, manualBarcodeProduct, normalizeBarcode, parseBarcodeProduct, recordedBarcodeSource, scaleBarcodeNutrition } from "../lib/food-barcode.ts";

test("EAN and UPC numbers can be entered without accepting unrelated text", () => {
  assert.equal(normalizeBarcode("３０１７６２０４２２００３"), "3017620422003");
  assert.equal(normalizeBarcode("3017-6204-22003"), "3017620422003");
  assert.equal(normalizeBarcode("1234"), null);
  assert.equal(normalizeBarcode("3017620abc003"), null);
});

test("missing nutrients remain unknown while an entered zero remains zero", () => {
  const product = parseBarcodeProduct("3017620422003", {
    status: "success",
    product: { product_name: "Sample", quantity: "250 g", nutriments: { "energy-kcal_100g": 100, proteins_100g: 0 } },
  });
  assert.ok(product);
  assert.deepEqual(scaleBarcodeNutrition(product.per100, 125), {
    calories: 125, proteinG: 0, fatG: undefined, carbsG: undefined,
  });
});

test("serving amount and liquid unit are used when present", () => {
  const product = parseBarcodeProduct("1234567890123", {
    status: "success",
    product: { product_name_ja: "飲料", quantity: "500 ml", serving_quantity: 250, nutriments: { "energy-kj_100g": 209.2, carbohydrates_100g: 5 } },
  });
  assert.ok(product);
  assert.equal(product.name, "飲料");
  assert.equal(product.amountUnit, "ml");
  assert.equal(product.suggestedAmount, 250);
  assert.deepEqual(scaleBarcodeNutrition(product.per100, 250), {
    calories: 125, proteinG: undefined, fatG: undefined, carbsG: 12.5,
  });
  assert.equal(parseBarcodeProduct("1234567890123", { status: "failure" }), null);
});

test("known domestic products return the documented package size and nutrition without a network call", async (t) => {
  const externalLookup = t.mock.method(globalThis, "fetch", () => { throw new Error("unexpected network call"); });
  const product = await lookupBarcodeProduct("04902105286890");
  assert.equal(product.code, "4902105286890");
  assert.equal(product.source, "manufacturer");
  assert.equal(product.suggestedAmount, 78);
  assert.equal(product.sourceUrl, "https://www.nissin.com/jp/product/items/12976/");
  assert.deepEqual(barcodeNutritionForAmount(product, 39), { calories: 141, proteinG: 8.1, fatG: 7.7, carbsG: 19.8 });
  assert.equal(externalLookup.mock.callCount(), 0);
});

test("unknown codes can still fall back to the public database and reject a mismatched response", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({
    status: "success",
    product: { code: "0034000470693", generic_name: "Test product" },
  }));
  assert.equal((await lookupBarcodeProduct("034000470693")).name, "Test product");
  assert.equal(fetchMock.mock.calls[0].arguments[0].pathname, "/api/v3/product/034000470693");
  assert.equal(await lookupBarcodeProduct("12345678"), null);
  assert.equal(await lookupBarcodeProduct("../barcode"), null);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(lookupBarcodeProduct("034000470693", controller.signal), { name: "AbortError" });
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("barcode history restores old liquid amounts and keeps manually supplied values and provenance", () => {
  const code = "034000470693";
  const item = { name: "テスト飲料（250ml）", sourceBarcode: code, barcodeSource: "manual", calories: 125.5, fatG: 0 };
  const meals = [{ items: [item] }];
  const product = findRecordedBarcodeProduct("0034000470693", meals);
  assert.equal(product.name, "テスト飲料");
  assert.equal(product.amountUnit, "ml");
  assert.equal(product.suggestedAmount, 250);
  assert.deepEqual(barcodeNutritionForAmount(product, 250), { calories: 125.5, proteinG: undefined, fatG: 0, carbsG: undefined });
  assert.equal(barcodeNutritionForAmount(product, 125).calories, 63);
  assert.equal(recordedBarcodeSource(item), undefined);
  assert.equal(findRecordedBarcodeProduct("034000470692", meals), null);
  assert.deepEqual(manualBarcodeProduct(code).per100, {});
});
