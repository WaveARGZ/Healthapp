import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";

function pureModule(relative) {
  const source = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require(id) { assert.fail(`unexpected pure-module dependency: ${id}`); } });
  return exports;
}
const portions = pureModule("../../lib/food-portions.ts");
const photoNutrition = pureModule("../../lib/food-ai/photo-nutrition-estimate.ts");
const photoHistory = pureModule("../../lib/food-ai/photo-history.ts");

// Real component events, synthetic in-memory input. No browser storage or network.
function harness({ sharedTest = false, saveFails = false, previousMeals = [], historyLoading = false, analysisResult = null } = {}) {
  const source = ts.transpileModule(readFileSync(new URL("../../components/meals/photo-meal-analyzer.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const states = [], refs = [], effects = [], saved = [], released = [], analyses = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const modules = {
    react: {
      useState(initial) { const i = stateIndex++; if (i >= states.length) states[i] = initial; return [states[i], (value) => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
      useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
      useEffect(callback) { const i = effectIndex++; if (!(i in effects)) effects[i] = callback(); },
    },
    "react/jsx-runtime": jsxRuntime, "next/image": { default: "img" }, "next/link": { default: "a" },
    "@/components/ui/button": { Button: "button" }, "@/components/ui/icon": { Icon: "span" },
    "@/lib/food-ai/food-photo-analyzer": { async analyzeFoodPhotoDetailed(_photo, _progress, options) { analyses.push(options); return analysisResult; } },
    "@/lib/food-ai/photo-history": photoHistory,
    "@/lib/food-ai/photo-nutrition-estimate": photoNutrition,
    "@/lib/drive/google-drive-client": { isSupportedFoodPhoto: () => true, sanitizeTrainingPhoto: async (photo) => photo },
    "@/lib/cloud/config": { isSharedTestEnvironment: sharedTest },
    "@/lib/data/food-library.json": { default: { foods: [] } },
    "@/lib/food-portions": portions,
  };
  const exports = {};
  vm.runInNewContext(source, { exports, require(id) { assert.ok(modules[id], `unexpected dependency: ${id}`); return modules[id]; },
    URL: { createObjectURL: () => "blob:synthetic", revokeObjectURL: (url) => released.push(url) },
  });
  const onAddFood = async (item) => { if (saveFails) throw Error("synthetic failure"); saved.push(structuredClone(item)); };
  function nodes(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
  function render() { stateIndex = refIndex = effectIndex = 0; return nodes(exports.PhotoMealAnalyzer({ onAddFood, previousMeals, historyLoading })); }
  function find(predicate) { const node = render().find(predicate); assert.ok(node); return node; }
  function click(label) { const node = find((n) => n.type === "button" && n.props.children === label); assert.notEqual(node.props.disabled, true); node.props.onClick(); }
  function choose() { find((n) => n.props.type === "file").props.onChange({ target: { files: [{ name: "synthetic.jpg", size: 10 }], value: "" } }); }
  function draft() {
    choose(); click("料理名を入力して続ける");
    find((n) => n.props.placeholder === "例：鶏むね肉の照り焼き").props.onChange({ target: { value: "テストの食事" } });
  }
  async function flush() { for (let i = 0; i < 5; i++) await Promise.resolve(); render(); }
  return { render, find, click, choose, draft, flush, saved, released, analyses };
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

test("photo analysis uses loaded personal history and a recommended saved dish without adding calories again", async () => {
  const previousMeals = [{ id: "meal", name: "焼きそば", createdAt: "2026-11-22T00:00:00Z" }];
  const history = { id: "history:yakisoba", origin: "history", food: { name: "焼きそば", calories: 200, portionGrams: 300 }, modelScore: .7, score: .7 };
  const h = harness({ previousMeals, analysisResult: { candidates: [], historyCandidates: [history], recommendedCandidateId: history.id } });
  h.choose(); h.click("写真をAIで解析"); await h.flush();
  assert.equal(h.analyses[0].previousMeals, previousMeals);
  assert.equal(h.find((n) => n.props.placeholder === "例：鶏むね肉の照り焼き").props.value, "焼きそば");
  const fields = h.render().filter((n) => n.props.type === "number" && n.props.placeholder === "未入力");
  assert.deepEqual(fields.map((n) => n.props.value), [200, "", "", ""]);
  assert.ok(h.render().some((n) => n.props.children === "前に登録した料理"));
  h.click("食事に追加して保存"); await h.flush();
  assert.equal(h.saved[0].calories, 200);
  assert.equal(Object.hasOwn(h.saved[0], "fatG"), false);
  assert.equal(Object.keys(h.saved[0]).some((name) => /image|embedding|photo/i.test(name)), false);
});

test("old nutrition without a serving does not invent a gram weight", async () => {
  const history = { id: "history:yakisoba", origin: "history", food: { name: "焼きそば", calories: 200 }, modelScore: .7, score: .7 };
  const h = harness({ analysisResult: { candidates: [], historyCandidates: [history], recommendedCandidateId: history.id } });
  h.choose(); h.click("写真をAIで解析"); await h.flush();
  assert.equal(h.find((n) => n.props["aria-label"] === "写真から登録する食べた量").props.value, "");
  assert.equal(h.find((n) => n.type === "button" && n.props.children === "食事に追加して保存").props.disabled, true);
});

test("photo analysis waits until existing dishes have finished loading", () => {
  const h = harness({ historyLoading: true }); h.choose();
  assert.equal(h.find((n) => n.type === "button" && n.props.children === "写真をAIで解析").props.disabled, true);
  assert.equal(h.analyses.length, 0);
});

test("switching a remembered serving to pieces requires the piece weight to be entered", async () => {
  const history = { id: "history:yakisoba", origin: "history", food: { name: "焼きそば", calories: 200, portionGrams: 300 }, modelScore: .7, score: .7 };
  const h = harness({ analysisResult: { candidates: [], historyCandidates: [history], recommendedCandidateId: history.id } });
  h.choose(); h.click("写真をAIで解析"); await h.flush(); h.click("個");
  assert.equal(h.find((n) => n.props["aria-label"] === "写真の食品1個あたりの重さ").props.value, "");
  assert.equal(h.find((n) => n.type === "button" && n.props.children === "食事に追加して保存").props.disabled, true);
});
