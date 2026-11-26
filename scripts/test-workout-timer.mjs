import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import * as audio from "../lib/workouts/rest-timer-audio.ts";
import * as iphoneTimer from "../lib/workouts/iphone-timer.ts";

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
    "@/lib/workouts/iphone-timer": iphoneTimer,
    "@/components/workouts/iphone-timer": { IphoneTimer: "iphone-timer" },
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
    suspend(ms) { now += ms; },
    requestClock() { return act((timer) => timer.requestClock(now)); },
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

test("handoff uses the tap time after suspension and releases web timing and audio", () => {
  const h = harness();
  h.toggle();
  h.suspend(30250);
  const timer = h.render();
  assert.equal(timer.seconds, 90, "the last render is stale while the tab is suspended");
  const url = timer.requestClock(31250);
  assert.equal(new URL(url).searchParams.get("text"), "60");
  assert.equal(h.render().clockRequest, 60);
  assert.equal(h.render().running, false);
  assert.equal(h.session.type, "auto");
  assert.equal(timer.requestClock(31250), null, "duplicate taps are blocked even before React commits");
  assert.equal(h.toggle().running, false, "web start remains blocked until recovery is acknowledged");
  assert.equal(h.advance(120000).finished, false);
  assert.equal(h.sounds.started, 0, "returning after the native deadline never sounds a second alarm");
  assert.equal(h.act((value) => value.reset()).clockRequest, null);
  assert.equal(h.toggle().running, true, "explicit recovery allows the web timer to start again");
  h.unmount();
});

test("paused rest time can be handed off, while cardio and expired rest cannot", () => {
  const h = harness();
  h.toggle(); h.advance(15000); h.toggle();
  h.suspend(100000);
  assert.equal(h.requestClock().clockRequest, 75);
  h.act((value) => value.reset());
  h.act((value) => value.changeMode("cardio"));
  assert.equal(h.render().requestClock(120000), null);
  h.act((value) => value.changeMode("rest"));
  h.toggle(); h.suspend(90000);
  assert.equal(h.requestClock().clockRequest, null);
  assert.equal(h.render().finished, true);
  assert.equal(h.sounds.started, 1, "the existing completed web alarm is retained");
  h.unmount();
});

test("invalid and oversized durations do not stop or hand off the web timer", () => {
  const h = harness();
  h.act((value) => value.changeDuration("minutes", "0"));
  h.act((value) => value.changeDuration("seconds", "0"));
  assert.equal(h.render().requestClock(1000), null);
  h.act((value) => value.changeDuration("minutes", "1440"));
  h.toggle();
  assert.equal(h.render().requestClock(1000), null);
  assert.equal(h.render().running, true);
  h.unmount();
});

test("Shortcuts URL carries only bounded whole seconds and the fixed shortcut name", () => {
  for (const duration of [0, -1, NaN, Infinity, 1.5, 86400, Number.MAX_SAFE_INTEGER]) {
    assert.equal(iphoneTimer.iphoneTimerURL(duration), null);
  }
  for (const duration of [1, 10, 90, 86399]) {
    const url = new URL(iphoneTimer.iphoneTimerURL(duration));
    assert.equal(url.protocol, "shortcuts:");
    assert.equal(url.host, "run-shortcut");
    assert.deepEqual([...url.searchParams], [["name", "BodyMake休憩タイマー"], ["input", "text"], ["text", String(duration)]]);
  }
});

test("iPhone control requires a tap, reports a request rather than success, and offers recovery on failure", () => {
  let iphone = true, opened, requested = 0, returned = 0;
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL("../components/workouts/iphone-timer.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const modules = {
    react: { useSyncExternalStore: () => iphone },
    "react/jsx-runtime": jsxRuntime,
    "@/components/ui/button": { Button: "button" },
    "@/lib/workouts/iphone-timer": iphoneTimer,
  };
  vm.runInNewContext(compiled, { exports, require: (id) => modules[id], window: { location: { assign(url) { opened = url; throw new Error("blocked"); } } } });
  const props = { seconds: 90, enabled: true, requestedSeconds: null, onRequest: () => { requested++; return iphoneTimer.iphoneTimerURL(90); }, onReturn: () => { returned++; } };
  function nodes(tree) {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    if (!tree || typeof tree !== "object") return [];
    return [tree, ...nodes(tree.props?.children)];
  }
  const tree = exports.IphoneTimer(props);
  assert.equal(requested, 0, "no automatic native launch");
  const button = nodes(tree).find((node) => node.type === "button");
  assert.doesNotThrow(() => button.props.onClick());
  assert.equal(requested, 1);
  assert.equal(opened, iphoneTimer.iphoneTimerURL(90));
  const pending = nodes(exports.IphoneTimer({ ...props, requestedSeconds: 90 }));
  assert.equal(pending.find((node) => node.props.role === "status").props.children, "「時計」で開始を確認してください");
  pending.find((node) => node.type === "button").props.onClick();
  assert.equal(returned, 1);
  iphone = false;
  assert.equal(exports.IphoneTimer(props), null, "other browsers keep their existing timer UI");
  assert.ok(exports.IphoneTimer({ ...props, requestedSeconds: 90 }), "pending recovery remains accessible");
});
