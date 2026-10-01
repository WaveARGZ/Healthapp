import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile("lib/utils/mobile-viewport.ts", "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { isSoftwareKeyboardOpen } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
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
console.log(`${cases.length} mobile keyboard detection cases passed. Physical-device viewport events still require device testing.`);
