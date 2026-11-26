import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import * as audio from "../lib/workouts/rest-timer-audio.ts";
import * as wakeLock from "../lib/workouts/timer-wake-lock.ts";

const source = ts.transpileModule(readFileSync(new URL("../components/workouts/workout-timer.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;

// Actual provider events/effect cleanup with RAM-only browser/audio mocks.
function harness({ sessionType = "auto", supported = true, wakeLockApi } = {}) {
  const states = [], refs = [], effects = [], pending = [], intervals = new Set();
  const listeners = new Map();
  const document = {
    visibilityState: "visible",
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
  };
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
    "@/lib/workouts/timer-wake-lock": wakeLock,
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports, require(id) { assert.ok(Object.hasOwn(modules, id), id); return modules[id]; },
    AudioContext, Date: { now: () => now },
    navigator: { ...(supported ? { audioSession: session } : {}), wakeLock: wakeLockApi },
    document,
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
    visibility(value) { document.visibilityState = value; for (const callback of [...(listeners.get("visibilitychange") ?? [])]) callback(); return render(); },
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

test("returning to a suspended page catches up the countdown and the cardio elapsed time", () => {
  const rest = harness();
  rest.toggle(); rest.visibility("hidden"); rest.suspend(95000);
  assert.equal(rest.render().seconds, 90, "browser ticks were suspended");
  assert.equal(rest.visibility("visible").finished, true);
  assert.equal(rest.render().seconds, 0);
  assert.equal(rest.sounds.started, 1);
  rest.unmount();
  const cardio = harness();
  cardio.act((timer) => timer.changeMode("cardio"));
  cardio.toggle(); cardio.visibility("hidden"); cardio.suspend(65000);
  assert.equal(cardio.visibility("visible").seconds, 65);
  assert.equal(cardio.sounds.started, 0);
  cardio.unmount();
});

test("screen wake is opt-in and releases on pause, completion, and unmount", async () => {
  let requested = 0, released = 0;
  const wakeLockApi = { async request() {
    requested++;
    return { released: false, addEventListener() {}, removeEventListener() {}, async release() { released++; } };
  } };
  const h = harness({ wakeLockApi });
  h.toggle(); await Promise.resolve(); assert.equal(requested, 0);
  h.act((timer) => timer.setKeepAwake(true)); await Promise.resolve();
  assert.equal(h.render().wakeStatus, "active");
  assert.equal(requested, 1);
  h.toggle(); assert.equal(released, 1);
  h.toggle(); await Promise.resolve();
  h.advance(90000); assert.equal(released, 2);
  h.act((timer) => timer.reset());
  h.toggle(); await Promise.resolve(); h.unmount();
  assert.equal(released, 3);
});

test("wake lock handles visibility, revocation, denial, and late completion without leaking a lock", async () => {
  const listeners = new Map(), reports = [], locks = [];
  const page = { visibilityState: "visible", addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  const api = { async request() {
    const events = new Map();
    const lock = { released: false, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name) => events.delete(name), async release() { lock.released = true; events.get("release")?.(); }, revoke() { lock.released = true; events.get("release")?.(); } };
    locks.push(lock); return lock;
  } };
  const cleanup = wakeLock.keepTimerScreenAwake(api, page, (value) => reports.push(value));
  await Promise.resolve(); assert.equal(reports.at(-1), "active");
  page.visibilityState = "hidden"; listeners.get("visibilitychange")();
  assert.equal(locks[0].released, true);
  page.visibilityState = "visible"; listeners.get("visibilitychange")();
  await Promise.resolve(); assert.equal(locks.length, 2);
  locks[1].revoke(); assert.equal(reports.at(-1), "released");
  cleanup(); assert.equal(listeners.size, 0);
  wakeLock.keepTimerScreenAwake(undefined, page, (value) => reports.push(value))();
  assert.equal(reports.at(-1), "unavailable");
  const denied = wakeLock.keepTimerScreenAwake({ request: async () => { throw Error("low power"); } }, page, (value) => reports.push(value));
  await Promise.resolve(); assert.equal(reports.at(-1), "unavailable"); denied();
  let grant;
  const late = wakeLock.keepTimerScreenAwake({ request: () => new Promise((resolve) => { grant = resolve; }) }, page, (value) => reports.push(value));
  late(); const count = reports.length;
  const lock = await api.request(); grant(lock); await Promise.resolve();
  assert.equal(lock.released, true); assert.equal(reports.length, count);
});
