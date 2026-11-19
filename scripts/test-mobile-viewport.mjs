import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile("lib/utils/mobile-viewport.ts", "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { isSoftwareKeyboardOpen, workoutSetEditorTop } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const phone = { width: 390, height: 844, baselineHeight: 844, scale: 1, editing: true };
const cases = [
  ["closed keyboard", {}, false],
  ["iOS visual viewport keyboard", { height: 510 }, true],
  ["Android resized content keyboard", { height: 470 }, true],
  ["browser toolbar only", { height: 760 }, false],
  ["no focused editor", { height: 510, editing: false }, false],
  ["pinch zoom is not a keyboard", { height: 420, scale: 2 }, false],
  ["slight zoom is not a keyboard", { height: 650, scale: 1.2 }, false],
  ["desktop with hardware keyboard", { width: 1280, height: 600 }, false],
  ["hardware keyboard on phone", {}, false],
  ["landscape keyboard", { width: 844, height: 180, baselineHeight: 390 }, true],
  ["small screen without a keyboard", { width: 320, height: 568, baselineHeight: 568 }, false],
];
for (const [label, patch, expected] of cases) {
  assert.equal(isSoftwareKeyboardOpen({ ...phone, ...patch }), expected, label);
}

let anchor = workoutSetEditorTop(null, 12, true);
assert.equal(anchor, 12, "opening set editor anchors its top");
anchor = workoutSetEditorTop(anchor, 94, true);
assert.equal(anchor, 12, "first input's keyboard pan does not move the editor");
anchor = workoutSetEditorTop(anchor, 138, true);
assert.equal(anchor, 12, "blur between weight and reps keeps the same anchor");
anchor = workoutSetEditorTop(anchor, 86, true);
assert.equal(anchor, 12, "next input keeps the same anchor");
anchor = workoutSetEditorTop(anchor, 86, false);
assert.equal(anchor, null, "closing set editor releases the anchor");
assert.equal(workoutSetEditorTop(anchor, 24, true), 24, "a new editor session uses the current top");
console.log(`${cases.length} mobile keyboard detection cases and set editor focus transitions passed. Physical-device viewport events still require device testing.`);
