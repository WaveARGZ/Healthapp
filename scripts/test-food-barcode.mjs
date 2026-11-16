import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBarcode, parseBarcodeProduct, scaleBarcodeNutrition } from "../lib/food-barcode.ts";

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
