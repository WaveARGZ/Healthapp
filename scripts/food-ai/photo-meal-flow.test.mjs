import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";

// Real component events, synthetic in-memory input. No browser storage or network.
function harness({ sharedTest = false, saveFails = false } = {}) {
  const source = ts.transpileModule(readFileSync(new URL("../../components/meals/photo-meal-analyzer.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const states = [], refs = [], effects = [], saved = [], released = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const modules = {
    react: {
      useState(initial) { const i = stateIndex++; if (i >= states.length) states[i] = initial; return [states[i], (value) => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
      useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
      useEffect(callback) { const i = effectIndex++; if (!(i in effects)) effects[i] = callback(); },
    },
    "react/jsx-runtime": jsxRuntime, "next/image": { default: "img" }, "next/link": { default: "a" },
    "@/components/ui/button": { Button: "button" }, "@/components/ui/icon": { Icon: "span" },
    "@/lib/food-ai/food-photo-analyzer": {},
    "@/lib/food-ai/photo-nutrition-estimate": { PHOTO_NUTRITION_UPLIFT: 0.15 },
    "@/lib/drive/google-drive-client": { isSupportedFoodPhoto: () => true },
    "@/lib/cloud/config": { isSharedTestEnvironment: sharedTest },
    "@/lib/data/food-library.json": { foods: [] },
    "@/lib/food-portions": {
      validPortion: (quantity) => quantity > 0 && quantity <= 3000,
      portionGrams: (quantity, unit, gramsPerPiece) => unit === "個" ? quantity * gramsPerPiece : quantity,
    },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, require(id) { assert.ok(modules[id], `unexpected dependency: ${id}`); return modules[id]; },
    URL: { createObjectURL: () => "blob:synthetic", revokeObjectURL: (url) => released.push(url) },
  });
  const onAddFood = async (item) => { if (saveFails) throw Error("synthetic failure"); saved.push(structuredClone(item)); };
  function nodes(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
  function render() { stateIndex = refIndex = effectIndex = 0; return nodes(exports.PhotoMealAnalyzer({ onAddFood })); }
  function find(predicate) { const node = render().find(predicate); assert.ok(node); return node; }
  function click(label) { const node = find((n) => n.type === "button" && n.props.children === label); assert.notEqual(node.props.disabled, true); node.props.onClick(); }
  function choose() { find((n) => n.props.type === "file").props.onChange({ target: { files: [{ name: "synthetic.jpg", size: 10 }], value: "" } }); }
  function draft() {
    choose(); click("料理名を入力して続ける");
    find((n) => n.props.placeholder === "例：鶏むね肉の照り焼き").props.onChange({ target: { value: "テストの食事" } });
  }
  async function flush() { for (let i = 0; i < 5; i++) await Promise.resolve(); render(); }
  return { render, find, click, choose, draft, flush, saved, released };
}

test("camera meal saves only nutritional record, releases preview, then offers a separate optional share page", async () => {
  const h = harness();
  assert.equal(h.render().some((n) => n.type === "a"), false);
  h.draft(); h.click("食事に追加して保存"); await h.flush();
  assert.equal(h.saved.length, 1);
  assert.deepEqual(Object.keys(h.saved[0]).sort(), ["name", "portionGrams", "portionQuantity", "portionUnit"]);
  assert.deepEqual(h.released, ["blob:synthetic"]);
  assert.equal(h.render().some((n) => n.type === "img"), false);
  const link = h.find((n) => n.type === "a");
  assert.equal(link.props.href, "/food-photo/"); // No photo, name or private record in the URL.
  assert.match(link.props.children, /任意/);
  h.choose();
  assert.equal(h.render().some((n) => n.type === "a"), false);
});

test("nutrition clear keeps missing fields distinct from an explicitly entered zero", async () => {
  const h = harness(); h.draft();
  h.click("カロリー・PFCを一括クリア");
  const fields = h.render().filter((n) => n.props.type === "number" && n.props.placeholder === "未入力");
  assert.ok(fields.every((n) => n.props.value === ""));
  fields[0].props.onChange({ target: { value: "0" } });
  h.click("食事に追加して保存"); await h.flush();
  assert.equal(h.saved[0].calories, 0);
  assert.equal(Object.hasOwn(h.saved[0], "proteinG"), false);
  assert.equal(Object.hasOwn(h.saved[0], "fatG"), false);
  assert.equal(Object.hasOwn(h.saved[0], "carbsG"), false);
});

test("failed saves keep the photo for retry and do not show a success or share action", async () => {
  const h = harness({ saveFails: true }); h.draft(); h.click("食事に追加して保存"); await h.flush();
  assert.equal(h.saved.length, 0);
  assert.equal(h.released.length, 0);
  assert.equal(h.render().some((n) => n.type === "a"), false);
  assert.match(h.find((n) => n.props.role === "status").props.children, /保存できませんでした/);
});

test("shared test does not expose learning submission from ordinary meal registration", async () => {
  const h = harness({ sharedTest: true }); h.draft(); h.click("食事に追加して保存"); await h.flush();
  assert.equal(h.saved.length, 1);
  assert.equal(h.render().some((n) => n.type === "a"), false);
});
