import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";

// No browser storage, network, real photos, or generated files: a memory-only
// component harness with real event dispatch and controlled Google callbacks.
function publicPhotoHarness(sharedTest = false, displayMode = "browser") {
  const source = ts.transpileModule(readFileSync(new URL("../../components/meals/public-food-photo.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const states = [], refs = [], effects = [], jobs = [], authorizations = [], posts = [], timers = new Map();
  let stateIndex = 0, refIndex = 0, effectIndex = 0, now = 100_000, sequence = 0;
  let rejection = "";
  let connectionReady = true, clipboardDenied = false;
  const copied = [], revokedPreviews = [];
  const window = new EventTarget(), document = new EventTarget();
  window.location = { origin: "https://example.invalid", pathname: "/food-photo/", search: "?private=never-copy", hash: "#never-copy" };
  window.matchMedia = (query) => ({ matches: query === `(display-mode: ${displayMode})`, addEventListener() {}, removeEventListener() {} });
  const navigator = { standalone: displayMode === "ios", clipboard: { async writeText(text) { if (clipboardDenied) throw new Error("denied"); copied.push(text); } } };
  const photo = { name: "synthetic.jpg", size: 10, lastModified: 1 };
  const react = {
    useState(initial) { const i = stateIndex++; if (i >= states.length) states[i] = initial; return [states[i], (value) => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useEffect(callback, deps) { const i = effectIndex++, old = effects[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) jobs.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: callback() }; }); },
    useSyncExternalStore(_s, getSnapshot) { return getSnapshot(); },
  };
  const modules = {
    react, "react/jsx-runtime": jsxRuntime, "next/image": { default: "img" }, "next/link": { default: "a" },
    "@/components/ui/button": { Button: "button" }, "@/components/ui/logo": { Logo: "div" },
    "@/lib/food-ai/food-photo-analyzer": {}, "@/lib/food-ai/food-catalog": { foodCatalog: [] },
    "@/lib/food-ai/photo-nutrition-estimate": {}, "@/lib/cloud/config": { isSharedTestEnvironment: sharedTest },
    "@/hooks/use-google-drive-client-id": { useGoogleDriveClientId: () => "mock-client", useTrainingDataEndpoint: () => "https://example.invalid", useTrainingConnection: () => ({ ready: connectionReady }) },
    "@/lib/utils/id": { createId: () => `mock-${++sequence}` },
    "@/lib/drive/google-drive-client": {
      isSupportedFoodPhoto: () => true,
      preloadGoogleIdentity: async () => {},
      requestGoogleAccountSession: (_id, { signal }) => new Promise((resolve, reject) => authorizations.push({ signal, resolve, reject })),
      submitFoodCorrectionToSharedDrive: async (input) => { posts.push(input); if (rejection) throw new Error(rejection); return { id: input.id }; },
    },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports, require: (id) => { assert.ok(modules[id], id); return modules[id]; }, window, document, navigator, AbortController, Error,
    URL: { createObjectURL: () => "blob:synthetic", revokeObjectURL(url) { revokedPreviews.push(url); } },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
    setTimeout: (callback) => { const id = ++sequence; timers.set(id, callback); return id; }, clearTimeout: (id) => timers.delete(id),
  });
  function nodes(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
  function render() { stateIndex = refIndex = effectIndex = 0; const tree = exports.PublicFoodPhoto(); while (jobs.length) jobs.shift()(); return nodes(tree); }
  function find(predicate) { const node = render().find(predicate); assert.ok(node); return node; }
  function button(label) { return find((n) => n.type === "button" && n.props.children === label); }
  function click(label) { const node = button(label); assert.notEqual(node.props.disabled, true, label); node.props.onClick(); }
  function choose(next = photo) { const node = find((n) => n.type === "input" && n.props.type === "file"); assert.notEqual(node.props.disabled, true); node.props.onChange({ target: { files: [next], value: "" } }); }
  async function flush() { for (let i = 0; i < 5; i++) await Promise.resolve(); render(); }
  async function authorize() { click("Googleで認証してから入力する"); authorizations.at(-1).resolve({ accessToken: "synthetic-token", expiresAt: now + 3600_000 }); await flush(); }
  function draft(next = photo, name = "手入力の料理") {
    choose(next); click(sharedTest ? "料理名を入力して確認する" : "料理名を入力して共有する");
    find((n) => n.type === "input" && n.props.placeholder === "例：卵焼き").props.onChange({ target: { value: name } });
    const checks = render().filter((n) => n.type === "input" && n.props.type === "checkbox");
    for (const check of checks) check.props.onChange({ target: { checked: true } });
    render();
  }
  return { render, find, button, click, choose, flush, authorize, draft, authorizations, posts, photo, window, document,
    expire() { now += 4000_000; document.dispatchEvent(new Event("visibilitychange")); render(); },
    rejectPost(message) { rejection = message; },
    connection(ready) { connectionReady = ready; },
    copied, revokedPreviews, denyClipboard() { clipboardDenied = true; },
  };
}

test("one Google login supports consecutive foods with separate consent, drafts, IDs and verified receipts", async () => {
  const h = publicPhotoHarness(); await h.authorize(); h.draft();
  h.find((n) => n.props.type === "number").props.onChange({ target: { value: "350" } });
  h.click("確認した正解を共有"); await h.flush();
  const firstId = h.posts[0].id;
  const receipts = () => h.render().filter((n) => n.type === "li");
  assert.equal(receipts().length, 1);
  h.click("次の食べ物を登録");
  assert.deepEqual(h.revokedPreviews, ["blob:synthetic"], "release the previous photo preview");
  assert.equal(h.render().some((n) => n.type === "img" || n.props.placeholder === "例：卵焼き"), false);
  assert.equal(receipts().length, 1, "previous receipt remains available after clearing the draft");
  assert.equal(h.find((n) => n.props.type === "file").props.disabled, false);
  const secondPhoto = { name: "second.jpg", size: 20, lastModified: 2 };
  h.choose(secondPhoto); h.click("料理名を入力して共有する");
  assert.equal(h.find((n) => n.props.placeholder === "例：卵焼き").props.value, "");
  assert.ok(h.render().filter((n) => n.props.type === "number").every((n) => n.props.value === ""));
  assert.ok(h.render().filter((n) => n.props.type === "checkbox").every((n) => !n.props.checked));
  h.find((n) => n.props.placeholder === "例：卵焼き").props.onChange({ target: { value: "次の料理" } });
  h.find((n) => n.props.type === "checkbox").props.onChange({ target: { checked: true } });
  assert.equal(h.button("確認した正解を共有").props.disabled, true, "consent is not carried over");
  h.button("確認した正解を共有").props.onClick(); await h.flush();
  assert.equal(h.posts.length, 1, "no automatic or unconsented second upload");
  h.render().filter((n) => n.props.type === "checkbox")[1].props.onChange({ target: { checked: true } });
  h.click("確認した正解を共有"); await h.flush();
  assert.equal(h.posts[1].image, secondPhoto);
  assert.equal(h.posts[1].confirmedFoodName, "次の料理");
  assert.equal(h.posts[1].nutrition.calories, 0, "previous nutrition is not reused");
  assert.equal(h.posts[1].predictedFoodIds.length, 0);
  assert.notEqual(h.posts[1].id, firstId);
  assert.equal(receipts().length, 2);
  assert.ok(h.render().some((n) => Array.isArray(n.props.children) && n.props.children.includes(firstId)));
  // Choosing another photo directly also keeps the receipts and authentication.
  h.draft({ name: "third.jpg", size: 30, lastModified: 3 }, "三品目");
  h.click("確認した正解を共有"); await h.flush();
  assert.equal(receipts().length, 3);
  assert.equal(new Set(h.posts.map((post) => post.id)).size, 3);
  assert.equal(h.authorizations.length, 1);
  assert.ok(h.posts.every((post) => post.accessToken === "synthetic-token" && post.consent === true));
});

test("a failed next registration keeps earlier receipts and retry identity without claiming success", async () => {
  const h = publicPhotoHarness(); await h.authorize(); h.draft();
  h.click("確認した正解を共有"); await h.flush();
  h.click("次の食べ物を登録"); h.draft({ name: "second.jpg", size: 20, lastModified: 2 });
  h.rejectPost("unverified receipt"); h.click("確認した正解を共有");
  assert.equal(h.render().some((n) => n.props.children === "次の食べ物を登録"), false, "cannot reset while sending");
  await h.flush();
  assert.equal(h.render().filter((n) => n.type === "li").length, 1);
  assert.equal(h.render().some((n) => n.props.children === "次の食べ物を登録"), false, "failed draft stays available for retry");
  h.rejectPost(""); h.click("確認した正解を共有"); await h.flush();
  assert.equal(h.posts[2].id, h.posts[1].id);
  assert.notEqual(h.posts[2].id, h.posts[0].id);
  assert.equal(h.render().filter((n) => n.type === "li").length, 2);
  assert.equal(h.authorizations.length, 1);
});

test("expired authentication between foods requires renewal without losing receipts or auto-submitting", async () => {
  const h = publicPhotoHarness(); await h.authorize(); h.draft();
  h.click("確認した正解を共有"); await h.flush(); h.expire();
  h.click("次の食べ物を登録");
  assert.equal(h.find((n) => n.props.type === "file").props.disabled, true);
  assert.equal(h.render().filter((n) => n.type === "li").length, 1);
  assert.equal(h.authorizations.length, 1, "next food never opens auth automatically");
  await h.authorize();
  assert.equal(h.posts.length, 1);
  h.draft(); h.click("確認した正解を共有"); await h.flush();
  assert.equal(h.posts.length, 2);
  assert.equal(h.render().filter((n) => n.type === "li").length, 2);
  const reload = publicPhotoHarness();
  assert.equal(reload.render().filter((n) => n.type === "li").length, 0, "receipts are memory-only");
  assert.equal(reload.find((n) => n.props.type === "file").props.disabled, true);
});

test("slow or failed receiver readiness cannot block Google auth or photo selection, but still blocks upload", async () => {
  const h = publicPhotoHarness(); h.connection(false);
  assert.equal(h.button("Googleで認証してから入力する").props.disabled, false);
  await h.authorize(); h.draft();
  assert.equal(h.authorizations.length, 1);
  assert.equal(h.button("確認した正解を共有").props.disabled, true);
  h.button("確認した正解を共有").props.onClick(); await h.flush();
  assert.equal(h.posts.length, 0, "authentication does not bypass receiver verification");
  h.connection(true); h.click("確認した正解を共有"); await h.flush();
  assert.equal(h.posts.length, 1);
});

test("nutrition inputs can clear a zero and replace it without a leading zero", async () => {
  const h = publicPhotoHarness(); await h.authorize(); h.draft();
  const fields = () => h.render().filter((node) => node.type === "input" && node.props.type === "number" && node.props.max === "10000");
  assert.equal(fields().length, 4);
  assert.ok(fields().every((node) => node.props.value === ""), "zero is a placeholder, not a forced value");
  fields()[0].props.onChange({ target: { value: "1" } });
  assert.equal(fields()[0].props.value, "1");
  fields()[0].props.onChange({ target: { value: "" } });
  assert.equal(fields()[0].props.value, "", "clearing must not restore 0 while editing");
  fields()[0].props.onChange({ target: { value: "50" } });
  assert.equal(fields()[0].props.value, "50");
  fields()[1].props.onChange({ target: { value: "0.5" } });
  assert.equal(fields()[1].props.value, "0.5");
  h.click("確認した正解を共有"); await h.flush();
  assert.equal(h.posts[0].nutrition.calories, 50);
  assert.equal(h.posts[0].nutrition.proteinG, 0.5);
  assert.equal(h.posts[0].nutrition.fatG, 0);
});

test("home-screen modes provide a credential-free browser handoff before entry without claiming authentication", async () => {
  for (const display of ["ios", "standalone", "fullscreen"]) {
    const h = publicPhotoHarness(false, display);
    h.find((n) => n.props.children === "ホーム画面・全画面からの認証について");
    assert.equal(h.authorizations.length, 0);
    const link = h.find((n) => n.type === "a" && n.props.target === "_blank");
    assert.equal(link.props.href, "https://example.invalid/food-photo/");
    assert.equal(link.props.rel, "noopener noreferrer");
    h.click("Safari／Chrome用のURLをコピー"); await h.flush();
    assert.deepEqual(h.copied, ["https://example.invalid/food-photo/"]);
    assert.equal(h.posts.length, 0);
    assert.equal(h.find((n) => n.props.type === "file").props.disabled, true);
    h.denyClipboard(); h.click("Safari／Chrome用のURLをコピー"); await h.flush();
    h.find((n) => typeof n.props.children === "string" && n.props.children.startsWith("自動でコピーできませんでした"));
    assert.equal(h.find((n) => n.props["aria-label"] === "通常ブラウザで開くURL").props.value, "https://example.invalid/food-photo/");
  }
});

test("pending auth explains the disabled picker and offers browser fallback without erasing an existing draft", async () => {
  const h = publicPhotoHarness(); h.click("Googleで認証してから入力する");
  h.find((n) => typeof n.props.children === "string" && n.props.children.startsWith("Google認証の結果を待っています"));
  h.find((n) => n.props["aria-label"] === "ブラウザで認証を続ける");
  h.click("認証待ちを解除してやり直す");
  await h.authorize(); h.draft(); h.expire();
  h.click("Googleで認証してから入力する");
  h.click("認証待ちを解除してやり直す"); await h.flush();
  assert.equal(h.find((n) => n.props.placeholder === "例：卵焼き").props.value, "手入力の料理");
  assert.equal(h.posts.length, 0);
});

test("sharing authenticates before photo entry; returning from 2FA never auto-submits", async () => {
  const h = publicPhotoHarness();
  assert.equal(h.find((n) => n.props.type === "file").props.disabled, true);
  h.click("Googleで認証してから入力する");
  h.window.dispatchEvent(new Event("pageshow"));
  assert.equal(h.find((n) => n.props.type === "file").props.disabled, true);
  h.authorizations[0].resolve({ accessToken: "synthetic-token", expiresAt: 3700_000 }); await h.flush();
  assert.equal(h.posts.length, 0);
  h.draft();
  h.window.dispatchEvent(new Event("pageshow")); h.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(h.find((n) => n.props.placeholder === "例：卵焼き").props.value, "手入力の料理");
  const send = h.button("確認した正解を共有");
  send.props.onClick(); send.props.onClick(); await h.flush();
  assert.equal(h.posts.length, 1, "double taps cannot duplicate sending");
  assert.equal(h.authorizations.length, 1, "submit does NOT reopen Google auth");
  assert.equal(h.posts[0].image, h.photo);
  assert.equal(h.posts[0].confirmedFoodName, "手入力の料理");
  assert.equal(h.posts[0].consent, true);
  assert.equal(h.button("共有済み").props.disabled, true);
});

test("cancel/retry cannot be overwritten by the previous late auth callback", async () => {
  const h = publicPhotoHarness();
  h.click("Googleで認証してから入力する");
  h.click("認証待ちを解除してやり直す");
  assert.equal(h.authorizations[0].signal.aborted, true);
  h.click("Googleで認証してから入力する");
  h.authorizations[0].resolve({ accessToken: "stale", expiresAt: 3700_000 }); await h.flush();
  assert.equal(h.button("Google認証中…").props.disabled, true);
  h.authorizations[1].reject(new Error("cancelled")); await h.flush();
  assert.equal(h.button("Googleで認証してから入力する").props.disabled, false);
  await h.authorize(); h.draft();
  assert.equal(h.posts.length, 0);
});

test("expiry and revoked auth preserve draft and receipt ID; renewal never sends automatically", async () => {
  const h = publicPhotoHarness(); await h.authorize(); h.draft();
  h.rejectPost("保存は未確認です（診断: invalid_google_token/auth）。");
  h.click("確認した正解を共有"); await h.flush();
  const id = h.posts[0].id;
  assert.equal(h.button("確認した正解を共有").props.disabled, true);
  await h.authorize();
  assert.equal(h.posts.length, 1);
  h.expire();
  assert.equal(h.button("確認した正解を共有").props.disabled, true);
  assert.equal(h.find((n) => n.props.placeholder === "例：卵焼き").props.value, "手入力の料理");
  await h.authorize(); h.rejectPost("");
  h.click("確認した正解を共有"); await h.flush();
  assert.equal(h.posts[1].id, id);
  assert.equal(h.posts[1].image, h.photo);
});

test("anonymous analysis and shared-test remain available without Google or upload", () => {
  const h = publicPhotoHarness(); h.click("認証せず解析だけ試す"); h.draft();
  assert.equal(h.authorizations.length, 0);
  assert.equal(h.button("確認した正解を共有").props.disabled, true);
  const staging = publicPhotoHarness(true); staging.draft();
  assert.equal(staging.authorizations.length, 0); assert.equal(staging.posts.length, 0);
  assert.equal(staging.render().some((n) => n.props.children === "Googleで認証してから入力する"), false);
  const reload = publicPhotoHarness();
  assert.equal(reload.find((n) => n.props.type === "file").props.disabled, true, "reload starts safely at auth; no persisted draft or credential");
});

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
      useSyncExternalStore(_subscribe, _getSnapshot, getServerSnapshot) { return getServerSnapshot(); },
    },
    "next/image": { default: "img" },
    "next/link": { default: "a" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/logo": { Logo: "div" },
    "@/lib/food-ai/food-photo-analyzer": {
      analyzeFoodPhotoDetailed: () => new Promise((resolve) => { finishAnalysis = resolve; analysisStarted(); }),
    },
    "@/lib/food-ai/food-catalog": { foodCatalog: [] },
    "@/lib/cloud/config": { isSharedTestEnvironment: false },
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
