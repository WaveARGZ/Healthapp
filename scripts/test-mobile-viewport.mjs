import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";

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

function loadModule(source, modules, globals) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`);
    return modules[name];
  }, ...globals });
  return exports;
}

// A modal opened below the top of the page must not move the background or
// lose its original inline styles/scroll position when dismissed.
const style = { position: "relative", top: "", left: "", width: "", overflow: "auto", paddingRight: "12px" };
const originalStyle = { ...style };
let restoredScroll;
const scrollLock = loadModule(await readFile("lib/utils/lock-page-scroll.ts", "utf8"), {}, {
  document: { body: { style }, documentElement: { clientWidth: 980 } },
  window: { scrollX: 8, scrollY: 640, innerWidth: 1000, getComputedStyle: () => ({ paddingRight: "12px" }), scrollTo: (value) => { restoredScroll = value; } },
});
const unlock = scrollLock.lockPageScroll();
assert.equal(style.position, "fixed");
assert.equal(style.top, "-640px");
assert.equal(style.left, "-8px");
assert.equal(style.paddingRight, "32px");
unlock();
assert.deepEqual(style, originalStyle);
assert.equal(restoredScroll.top, 640);
assert.equal(restoredScroll.left, 8);

let effect;
let viewportState;
let queuedFrame;
let dialogMode = "picker";
class Element { isContentEditable = false; }
class Input extends Element {
  type = "search";
  closest() { return dialogMode === "picker" ? {} : null; }
  hasAttribute() { return false; }
}
class TimerInput extends Input {
  type = "text";
  hasAttribute(name) { return name === "data-workout-timer-input"; }
}
class Textarea extends Element { hasAttribute(name) { return name === "data-workout-set-note"; } }
const activeInput = new Input();
const listeners = new Map();
const visual = { height: 844, offsetTop: 0, scale: 1, addEventListener: (event, handler) => listeners.set(event, handler), removeEventListener() {} };
const documentMock = {
  activeElement: activeInput,
  querySelector: () => dialogMode ? { hasAttribute: (name) => name === "data-set-editor" && dialogMode === "sets" } : null,
  addEventListener: (event, handler) => listeners.set(event, handler),
  removeEventListener() {},
};
const windowMock = { visualViewport: visual, innerHeight: 844, innerWidth: 390, addEventListener() {}, removeEventListener() {} };
const viewport = loadModule(await readFile("components/layout/mobile-viewport.tsx", "utf8"), {
  react: { useEffect: (callback) => { effect = callback; }, useState: (initial) => { viewportState = initial; return [initial, (next) => { viewportState = next(viewportState); }]; } },
  "react/jsx-runtime": { jsx: () => null },
  "@/lib/utils/mobile-viewport": { isSoftwareKeyboardOpen },
}, { window: windowMock, document: documentMock, HTMLElement: Element, HTMLInputElement: Input, HTMLTextAreaElement: Textarea,
  requestAnimationFrame: (callback) => { queuedFrame = callback; return 1; }, cancelAnimationFrame() {} });
viewport.MobileViewport({ children: null });
const cleanup = effect();
function update(event, height, top, active = activeInput) {
  visual.height = height; visual.offsetTop = top; documentMock.activeElement = active;
  listeners.get(event)({ target: active }); queuedFrame();
}
queuedFrame();
update("resize", 510, 110);
assert.equal(viewportState.top, 0);
assert.equal(viewportState.height, 510);
// Focus gaps in the picker must not replace the dialog anchor.
update("focusout", 510, 170, new Element());
assert.equal(viewportState.top, 0, "focus gaps must not replace the editor anchor");
assert.equal(viewportState.editing, false);
assert.equal(viewportState.keyboard, true, "keep navigation hidden until the keyboard actually closes");
update("focusin", 510, 190);
assert.equal(viewportState.top, 0);
update("resize", 844, 40, new Element());
assert.equal(viewportState.top, 0, "keyboard dismissal must not move the editor");
assert.equal(viewportState.keyboard, false);
dialogMode = "sets";
update("resize", 510, 160, new Element());
assert.equal(viewportState.height, 844, "the numeric keypad is not resized by viewport events");
update("focusin", 510, 110, new Textarea());
assert.equal(viewportState.height, 510, "the memo panel fits above the device keyboard");
assert.equal(viewportState.top, 110, "the memo panel uses the visible viewport's position");
assert.equal(viewportState.keyboard, true);
update("focusin", 480, 135, new TimerInput());
assert.equal(viewportState.height, 480, "the timer fields fit above the device keyboard");
assert.equal(viewportState.top, 135, "the timer fields use the visible viewport's position");
assert.equal(viewportState.keyboard, true);
dialogMode = null;
update("focusout", 510, 0, new Element());
assert.equal(viewportState.keyboard, true, "keep navigation hidden if the page changes before the keyboard closes");
update("focusout", 844, 0, new Element());
assert.equal(viewportState.keyboard, false, "restore navigation when the visible area recovers");
update("resize", 510, 0);
update("resize", 844, 0);
assert.equal(viewportState.editing, false, "restore navigation when Android dismisses the keyboard but keeps the input focused");
update("focusin", 844, 0, new Input());
assert.equal(viewportState.editing, true, "hide navigation again when another text input is focused");
visual.scale = 2;
update("resize", 422, 90);
assert.equal(viewportState.height, 0, "pinch zoom keeps the browser's native viewport");
cleanup();
console.log("Modal scroll restoration and keyboard focus-switch stability passed.");

const { WorkoutSetNumberField } = loadModule(await readFile("components/workouts/workout-set-number-field.tsx", "utf8"), {
  react: { useState: (initial) => [initial, () => {}] },
  "react/jsx-runtime": jsxRuntime,
  "@/components/ui/form-fields": { TextInput: "input" },
  "@/components/ui/icon": { Icon: "span" },
});
const emptySetField = {
  value: undefined,
  historicalValue: 62.5,
  label: "セット1の重量 kg",
  step: "0.5",
  onCommit: () => assert.fail("a displayed historical value must not be committed"),
};
const [desktopField] = WorkoutSetNumberField(emptySetField).props.children;
assert.equal(desktopField.props.value, "");
assert.equal(desktopField.props.placeholder, "62.5");
desktopField.props.onBlur({ currentTarget: { value: "" } });

const touchField = { active: false, value: "", onSelect() {} };
const [phoneField] = WorkoutSetNumberField({ ...emptySetField, touchField }).props.children;
assert.match(phoneField.props["aria-label"], /未入力/);
assert.equal(phoneField.props["aria-description"], "前回の記録 62.5");
assert.equal(phoneField.props.children.props.children, "62.5");
const [filledPhone] = WorkoutSetNumberField({ ...emptySetField, value: 0, touchField: { ...touchField, value: "0" } }).props.children;
assert.equal(filledPhone.props.children, "0");
assert.equal(filledPhone.props["aria-description"], undefined);
console.log("Previous set hints remain placeholders on desktop and the mobile keypad.");
