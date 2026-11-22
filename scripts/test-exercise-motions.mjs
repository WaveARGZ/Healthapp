import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import { registrationExercises } from "../lib/data/registration-exercise-catalog.ts";
import { exerciseMotions, getExerciseMotion } from "../lib/workouts/exercise-motions.ts";

// Exercise the actual SVG renderer without a browser, network or user records.
const output = ts.transpileModule(readFileSync("components/workouts/exercise-motion-icon.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const iconModule = { exports: {} };
vm.runInNewContext(output, { exports: iconModule.exports, require(name) {
  if (name === "react/jsx-runtime") return jsxRuntime;
  assert.equal(name, "@/lib/workouts/exercise-motions");
  return { getExerciseMotion };
} });
const renderIcon = (name, category) => renderToStaticMarkup(jsxRuntime.jsx(iconModule.exports.ExerciseMotionIcon, { name, category }));

test("every registered exercise has a researched movement and renderable artwork", () => {
  const sources = readFileSync("EXERCISE-ICON-SOURCES.md", "utf8");
  assert.deepEqual(new Set(Object.keys(exerciseMotions)), new Set(registrationExercises.map((item) => item.name)));
  for (const exercise of registrationExercises) {
    const motion = getExerciseMotion(exercise.name);
    assert.notEqual(motion.kind, "custom", exercise.name);
    assert.ok(motion.action.length > 5, exercise.name);
    assert.ok(sources.includes("`" + motion.reference + "`"), `${exercise.name}: missing research reference`);
    const svg = renderIcon(exercise.name, exercise.category);
    assert.match(svg, /<path /, exercise.name);
    assert.match(svg, /viewBox="0 0 96 80"/);
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /focusable="false"/);
    assert.doesNotMatch(svg, /NaN|Infinity|<image|<animate|<foreignObject|https?:|tabindex|<button/i);
    assert.ok(Buffer.byteLength(svg) < 6500, `${exercise.name}: pictogram must remain compact`);
  }
});

test("recorded previous names retain their artwork", () => {
  for (const exercise of registrationExercises.filter((item) => item.previousName)) {
    assert.equal(renderIcon(exercise.previousName), renderIcon(exercise.name), exercise.previousName);
  }
});

test("unknown custom names never imply a guessed exercise technique", () => {
  for (const name of ["自分の種目", "新しい押す運動", "constructor", "__proto__", "toString", ""]) {
    assert.equal(getExerciseMotion(name, "脚").kind, "custom");
    assert.equal(getExerciseMotion(name, "脚").category, "脚");
    assert.match(renderIcon(name, "脚"), /data-exercise-motion="custom"/);
  }
});

test("opposite actions, equipment and posture variations remain visually distinct", () => {
  for (const [first, second] of [
    ["ヒップアダクション", "ヒップアブダクション"],
    ["レッグエクステンション", "シーテッドレッグカール"],
    ["シーテッドレッグカール", "ライイングレッグカール"],
    ["ベンチプレス", "ダンベルベンチプレス"],
    ["ベンチプレス", "スミスマシンベンチプレス"],
    ["ベンチプレス", "インクラインバーベルベンチプレス"],
    ["腕立て伏せ", "膝つき腕立て伏せ"],
    ["膝つき腕立て伏せ", "壁腕立て伏せ"],
    ["ダンベルカール", "ハンマーカール"],
    ["バーベルカール", "EZバーカール"],
    ["ランジ", "リバースランジ"],
    ["ウォーキング", "ランニング"],
  ]) {
    // Titles alone must not make two otherwise identical drawings pass.
    assert.notEqual(renderIcon(first).replace(/<title>.*?<\/title>/, ""), renderIcon(second).replace(/<title>.*?<\/title>/, ""), `${first} / ${second}`);
  }
});
