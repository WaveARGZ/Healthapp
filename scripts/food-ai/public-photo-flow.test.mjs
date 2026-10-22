import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";

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
