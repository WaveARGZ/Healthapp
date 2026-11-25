import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import * as audio from "../lib/workouts/rest-timer-audio.ts";

const source = ts.transpileModule(readFileSync(new URL("../components/workouts/workout-timer.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;

// Actual provider events/effect cleanup with RAM-only browser/audio mocks.
function harness({ sessionType = "auto", supported = true } = {}) {
  const states = [], refs = [], effects = [], pending = [], intervals = new Set();
  const session = { type: sessionType }, sounds = { started: 0, stopped: 0, closed: 0 };
  let stateIndex = 0, refIndex = 0, effectIndex = 0, now = 1000;
  class AudioContext {
    state = "running";
    sampleRate = 8000;
    destination = {};
    async resume() { this.state = "running"; }
    async close() { sounds.closed++; }
    createBuffer() { return { copyToChannel() {} }; }
    createBufferSource() {
      return { connect() {}, disconnect() {}, start() { sounds.started++; }, stop() { sounds.stopped++; } };
    }
  }
  const modules = {
    react: {
      createContext: () => ({ Provider: "provider" }),
      useState(initial) {
        const i = stateIndex++;
        if (!(i in states)) states[i] = initial;
        return [states[i], (value) => { states[i] = typeof value === "function" ? value(states[i]) : value; }];
      },
      useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
      useEffect(callback, deps) {
        const i = effectIndex++, previous = effects[i];
        if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) pending.push({ i, callback, deps });
      },
    },
    "react/jsx-runtime": jsxRuntime,
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/form-fields": { SelectInput: "select", TextInput: "input" },
    "@/components/ui/icon": { Icon: "span" },
    "@/lib/workouts/rest-timer-audio": audio,
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports, require(id) { assert.ok(Object.hasOwn(modules, id), id); return modules[id]; },
    AudioContext, Date: { now: () => now },
    navigator: supported ? { audioSession: session } : {},
    document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
    window: {
      setInterval(fn) { intervals.add(fn); return fn; }, clearInterval(fn) { intervals.delete(fn); },
      setTimeout() { return 1; }, clearTimeout() {}, addEventListener() {}, removeEventListener() {},
    },
  });
  function render() {
    stateIndex = refIndex = effectIndex = 0;
    const tree = exports.WorkoutTimerProvider({ children: null });
    const updates = pending.splice(0);
    for (const { i } of updates) effects[i]?.cleanup?.();
    for (const { i, callback, deps } of updates) effects[i] = { deps, cleanup: callback() };
    return tree.props.value;
  }
  function act(callback) { callback(render()); return render(); }
  return {
    session, sounds, render, act,
    toggle() { return act((timer) => timer.toggle(now)); },
    advance(ms) { now += ms; for (const tick of [...intervals]) tick(); return render(); },
    unmount() { for (const effect of effects) effect.cleanup?.(); },
  };
}

test("reset during countdown restores the original session, including after restarting and stopping", () => {
  for (const sessionType of ["auto", "playback"]) {
    const h = harness({ sessionType });
    assert.equal(h.toggle().running, true);
    assert.equal(h.session.type, "ambient");
    assert.equal(h.sounds.started, 0);
    h.advance(1000);
    assert.equal(h.act((timer) => timer.reset()).running, false);
    assert.equal(h.session.type, sessionType);
    assert.equal(h.render().seconds, 90);
    h.toggle();
    assert.equal(h.session.type, "ambient");
    h.toggle();
    assert.equal(h.session.type, sessionType);
    h.unmount();
    assert.equal(h.session.type, sessionType);
  }
});

test("mode and duration changes release the countdown session before another start", () => {
  for (const change of [(timer) => timer.changeMode("cardio"), (timer) => timer.changeDuration("seconds", "20")]) {
    const h = harness();
    h.toggle();
    assert.equal(h.act(change).running, false);
    assert.equal(h.session.type, "auto");
    h.act((timer) => timer.changeMode("rest"));
    h.toggle(); h.toggle();
    assert.equal(h.session.type, "auto");
    h.unmount();
  }
});

test("completion prioritizes only the alarm and stopping releases audio before a fresh countdown", () => {
  const h = harness();
  h.toggle();
  assert.equal(h.sounds.started, 0);
  assert.equal(h.advance(90000).finished, true);
  assert.equal(h.session.type, "playback");
  assert.equal(h.sounds.started, 1);
  assert.equal(h.toggle().finished, false);
  assert.equal(h.session.type, "auto");
  assert.equal(h.sounds.stopped, 1);
  h.toggle(); h.unmount();
  assert.equal(h.session.type, "auto");
  assert.equal(h.sounds.closed, 1);
});

test("reset and completion remain usable when Audio Session is unsupported", () => {
  const h = harness({ supported: false });
  h.toggle(); h.act((timer) => timer.reset());
  h.toggle();
  assert.equal(h.advance(90000).finished, true);
  assert.equal(h.sounds.started, 1);
  h.toggle();
  assert.equal(h.sounds.stopped, 1);
  h.unmount();
});
