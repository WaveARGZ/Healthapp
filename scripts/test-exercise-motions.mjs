import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import { registrationExercises, registeredExerciseForName } from "../lib/data/registration-exercise-catalog.ts";
import { exerciseMotions, getExerciseMotion } from "../lib/workouts/exercise-motions.ts";

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync("public/images/exercises/v2/manifest.json", "utf8"));
const imageModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync("lib/workouts/exercise-illustrations.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: imageModule.exports, require(name) {
  assert.match(name, /^@\/public\/images\/exercises\/v2\/[a-z-]+\.webp$/);
  const bytes = readFileSync(name.replace("@/", ""));
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  return { default: { src: name.replace("@/public", ""), width: 384, height: 384 } };
} });
const { exerciseIllustrations } = imageModule.exports;

// Render the real image component without a browser, network or user records.
const output = ts.transpileModule(readFileSync("components/workouts/exercise-motion-icon.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const iconModule = { exports: {} };
vm.runInNewContext(output, { exports: iconModule.exports, require(name) {
  if (name === "react/jsx-runtime") return jsxRuntime;
  if (name === "next/image") return require("next/image");
  if (name === "@/lib/data/registration-exercise-catalog") return { registeredExerciseForName };
  if (name === "@/lib/workouts/exercise-illustrations") return { exerciseIllustrations };
  assert.equal(name, "@/lib/workouts/exercise-motions");
  return { getExerciseMotion };
} });
const renderIcon = (name, category) => renderToStaticMarkup(jsxRuntime.jsx(iconModule.exports.ExerciseMotionIcon, { name, category }));

test("every registered exercise has a researched movement and renderable artwork", () => {
  const sources = readFileSync("EXERCISE-ICON-SOURCES.md", "utf8");
  assert.deepEqual(new Set(Object.keys(exerciseMotions)), new Set(registrationExercises.map((item) => item.name)));
  assert.deepEqual(new Set(Object.keys(exerciseIllustrations)), new Set(registrationExercises.map((item) => item.name)));
  assert.deepEqual(new Set(manifest.images.map((item) => item.name)), new Set(registrationExercises.map((item) => item.name)));
  assert.equal(manifest.images.length, registrationExercises.length);
  assert.equal(manifest.source, "ai_generated_illustration");
  assert.ok(manifest.images.reduce((sum, item) => sum + item.bytes, 0) < 2_500_000);
  for (const exercise of registrationExercises) {
    const motion = getExerciseMotion(exercise.name);
    assert.notEqual(motion.kind, "custom", exercise.name);
    assert.ok(motion.action.length > 5, exercise.name);
    assert.ok(sources.includes("`" + motion.reference + "`"), `${exercise.name}: missing research reference`);
    const html = renderIcon(exercise.name, exercise.category);
    assert.match(html, /<img /, exercise.name);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /alt=""/);
    assert.match(html, /loading="lazy"/);
    assert.match(html, /width="384" height="384"/);
    assert.doesNotMatch(html, /NaN|Infinity|<animate|<foreignObject|https?:|tabindex|<button|_next\/image/i);
    const asset = manifest.images.find((item) => item.name === exercise.name);
    const bytes = readFileSync("public" + exerciseIllustrations[exercise.name].src);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, exercise.name);
    assert.equal(bytes.length, asset.bytes);
    assert.ok(bytes.length < 30000, `${exercise.name}: thumbnail remains light`);
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
    const custom = renderIcon(name, "脚");
    assert.match(custom, /data-exercise-motion="custom"/);
    assert.match(custom, /<svg/);
    assert.doesNotMatch(custom, /<img/);
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
    // Different labels/URLs must not make the same bitmap pass.
    assert.notEqual(manifest.images.find((item) => item.name === first).sha256,
      manifest.images.find((item) => item.name === second).sha256, `${first} / ${second}`);
  }
});
