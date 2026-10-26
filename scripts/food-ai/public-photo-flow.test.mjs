import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";

test("connection hook recovers on network return and cancels stale checks without reloading", async () => {
  const source = ts.transpileModule(readFileSync(new URL("../../hooks/use-google-drive-client-id.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const states = [], effects = [], jobs = [], requests = [];
  let stateIndex = 0, effectIndex = 0;
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const navigator = { onLine: true };
  const react = {
    useState(initial) {
      const index = stateIndex++;
      if (index >= states.length) states[index] = initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useEffect(callback, deps) {
      const index = effectIndex++, previous = effects[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        jobs.push(() => { previous?.cleanup?.(); effects[index] = { deps, cleanup: callback() }; });
      }
    },
  };
  const modules = {
    react,
    "@/lib/storage/google-drive-settings": {},
    "@/lib/drive/google-drive-client": {
      preloadGoogleIdentity: async () => {},
      checkTrainingConnection: (endpoint, clientId, signal) => new Promise((resolve, reject) => requests.push({ endpoint, clientId, signal, resolve, reject })),
      trainingConnectionError: () => "接続エラー",
    },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, window, document, navigator, AbortController, require: (id) => modules[id] });
  function render(client = "client") {
    stateIndex = effectIndex = 0;
    const state = exports.useTrainingConnection(client, "endpoint");
    while (jobs.length) jobs.shift()();
    return state;
  }
  async function flush() { for (let i = 0; i < 5; i++) await Promise.resolve(); }
  assert.equal(render().checking, true);
  requests[0].reject(new Error("temporary")); await flush();
  assert.equal(render().error, "接続エラー");
  navigator.onLine = false;
  window.dispatchEvent(new Event("online")); render();
  assert.equal(requests.length, 1, "offline events do not start more requests");
  navigator.onLine = true;
  window.dispatchEvent(new Event("online"));
  window.dispatchEvent(new Event("pageshow"));
  assert.equal(render().checking, true);
  assert.equal(requests.length, 2, "recovery events coalesce into a single check");
  assert.equal(requests[0].signal.aborted, true);
  render("changed-client");
  assert.equal(requests[1].signal.aborted, true);
  requests[1].resolve(); await flush();
  assert.equal(render("changed-client").ready, false, "stale success cannot enable sharing");
  requests[2].resolve(); await flush();
  assert.equal(render("changed-client").ready, true);
  window.dispatchEvent(new Event("online"));
  document.dispatchEvent(new Event("visibilitychange"));
  render("changed-client");
  assert.equal(requests.length, 3, "a healthy connection is not repeatedly polled");
  for (const effect of effects) effect?.cleanup?.();
  assert.equal(requests[2].signal.aborted, true);
});

test("manual entry escapes a pending AI analysis and ignores its late results", async () => {
  const source = ts.transpileModule(readFileSync(new URL("../../components/meals/public-food-photo.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const photo = new Blob(["synthetic-photo"], { type: "image/jpeg" });
  const states = [photo];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  let finishAnalysis;
  let analysisStarted;
  const started = new Promise((resolve) => { analysisStarted = resolve; });
  const modules = {
    "react/jsx-runtime": jsxRuntime,
    react: {
      useState(initial) {
        const index = stateIndex++;
        if (index >= states.length) states[index] = initial;
        return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
      useEffect() {},
    },
    "next/image": { default: "img" },
    "next/link": { default: "a" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/logo": { Logo: "div" },
    "@/lib/food-ai/food-photo-analyzer": {
      analyzeFoodPhotoDetailed: () => new Promise((resolve) => { finishAnalysis = resolve; analysisStarted(); }),
    },
    "@/lib/food-ai/food-catalog": { foodCatalog: [] },
    "@/lib/food-ai/photo-nutrition-estimate": { applyPhotoNutritionUplift: (food) => food },
    "@/lib/drive/google-drive-client": { sanitizeTrainingPhoto: async () => photo },
    "@/hooks/use-google-drive-client-id": {
      useGoogleDriveClientId: () => "synthetic-client",
      useTrainingDataEndpoint: () => "https://example.invalid",
      useTrainingConnection: () => ({ ready: true, checking: false, error: "", retry() {} }),
    },
    "@/lib/utils/id": { createId: () => "synthetic-id" },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, require: (id) => { assert.ok(modules[id], id); return modules[id]; } });
  function render() { stateIndex = refIndex = 0; return exports.PublicFoodPhoto(); }
  function descendants(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(descendants);
    return [node, ...descendants(node.props?.children)];
  }
  function button(tree, label) {
    const found = descendants(tree).find((node) => node.type === "button" && node.props.children === label);
    assert.ok(found, label);
    return found;
  }
  button(render(), "写真をAIで解析").props.onClick();
  await started;
  const escape = button(render(), "解析を待たずに料理名を入力");
  assert.notEqual(escape.props.disabled, true);
  escape.props.onClick();
  const manual = render();
  const nameField = descendants(manual).find((node) => node.type === "input" && node.props.placeholder === "例：卵焼き");
  assert.ok(nameField, "the correction form becomes available without finishing inference");
  nameField.props.onChange({ target: { value: "手入力の料理" } });
  finishAnalysis({ candidates: [{ id: "late-result", food: { name: "遅れて返った候補" } }] });
  await Promise.resolve();
  await Promise.resolve();
  const after = render();
  const finalName = descendants(after).find((node) => node.type === "input" && node.props.placeholder === "例：卵焼き");
  assert.equal(finalName.props.value, "手入力の料理");
  assert.equal(states[0], photo, "the selected photo stays in memory");
  assert.equal(states[8], "ready", "late inference cannot put the screen back into analyzing");
  assert.deepEqual(Array.from(states[2]), [], "late AI candidates are ignored");
});
