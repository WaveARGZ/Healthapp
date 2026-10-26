import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { validateTrainingReceipt } from "../../lib/drive/training-receipt.mjs";
import { stripCanvasJpegMetadata } from "../../lib/drive/jpeg-metadata.mjs";
import { baselineJpeg, withExif } from "./test-support/jpeg-fixtures.mjs";

const source = ts.transpileModule(readFileSync(new URL("../../lib/drive/google-drive-client.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const endpoint = "https://script.google.com/macros/s/test-receiver/exec";
const clientId = "synthetic-client.apps.googleusercontent.com";

function browser(overrides = {}) {
  const exported = {};
  const scripts = [];
  const encoded = [];
  const revoked = [];
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage() {} }),
    toBlob(callback, type, quality) { encoded.push({ width: this.width, quality }); callback(new Blob([baselineJpeg], { type })); },
  };
  const context = {
    exports: exported,
    require: (id) => {
      if (id === "@/lib/drive/jpeg-metadata.mjs") return { stripCanvasJpegMetadata };
      assert.equal(id, "@/lib/drive/training-receipt.mjs");
      return { validateTrainingReceipt };
    },
    window: {},
    document: { createElement: (tag) => tag === "canvas" ? canvas : { remove() {} }, head: { appendChild: (value) => scripts.push(value) } },
    URL: class extends URL { static createObjectURL() { return "blob:synthetic"; } static revokeObjectURL(value) { revoked.push(value); } },
    createImageBitmap: async () => ({ width: 4032, height: 3024, close() {} }),
    Blob, AbortController, Error, crypto: webcrypto, setTimeout, clearTimeout,
    FileReader: class {
      readAsDataURL(blob) { blob.arrayBuffer().then((value) => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`; this.onload(); }); }
    },
    ...overrides,
  };
  vm.runInNewContext(source, context);
  return { api: exported, context, scripts, canvas, encoded, revoked };
}

test("Google popup is opened only from a ready user action, not a delayed script callback", async () => {
  const b = browser();
  await assert.rejects(b.api.requestGoogleAccountToken(clientId), /準備しています/);
  assert.equal(b.scripts.length, 1);
  let opened = 0;
  b.context.window.google = { accounts: { oauth2: { initTokenClient: (options) => ({ requestAccessToken() { opened++; options.callback({ access_token: "synthetic-token" }); } }) } } };
  b.scripts[0].onload();
  assert.equal(opened, 0);
  assert.equal(await b.api.requestGoogleAccountToken(clientId), "synthetic-token");
  assert.equal(opened, 1);
});

test("popup cancellation/failure settles the request and allows another tap", async () => {
  let result = "popup_closed";
  const b = browser({ window: { google: { accounts: { oauth2: { initTokenClient: (options) => ({ requestAccessToken() {
    if (result) options.error_callback({ type: result }); else options.callback({ access_token: "synthetic-token" });
  } }) } } } } });
  await assert.rejects(b.api.requestGoogleAccountToken(clientId), /閉じられました/);
  result = "popup_failed_to_open";
  await assert.rejects(b.api.requestGoogleAccountToken(clientId), /SafariまたはChrome/);
  result = "";
  assert.equal(await b.api.requestGoogleAccountToken(clientId), "synthetic-token");
});

test("an OAuth flow without any callback times out", async () => {
  let expire;
  const b = browser({
    window: { google: { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken() {} }) } } } },
    setTimeout: (callback) => { expire = callback; return 1; }, clearTimeout() {},
  });
  const pending = b.api.requestGoogleAccountToken(clientId);
  expire();
  await assert.rejects(pending, /時間切れ/);
});

test("pre-input authorization allows 2FA time and exposes only a bounded memory session", async () => {
  let callback, delay;
  const b = browser({
    window: { google: { accounts: { oauth2: { initTokenClient: (options) => { callback = options.callback; return { requestAccessToken() {} }; } } } } },
    setTimeout: (_callback, ms) => { delay = ms; return 1; }, clearTimeout() {},
  });
  const before = Date.now();
  const pending = b.api.requestGoogleAccountSession(clientId);
  assert.equal(delay, 600_000);
  callback({ access_token: "synthetic-session", expires_in: "3600" });
  const session = await pending;
  assert.equal(session.accessToken, "synthetic-session");
  assert.ok(session.expiresAt >= before + 3540_000 && session.expiresAt <= Date.now() + 3540_000);
  const missingExpiry = b.api.requestGoogleAccountSession(clientId);
  callback({ access_token: "synthetic-session" });
  assert.ok((await missingExpiry).expiresAt <= Date.now(), "missing expiry is not considered reusable");
});

test("cancelling authorization releases the wait and ignores late Google callbacks", async () => {
  let callback, cleared = false;
  const b = browser({
    window: { google: { accounts: { oauth2: { initTokenClient: (options) => { callback = options.callback; return { requestAccessToken() {} }; } } } } },
    setTimeout: () => 1, clearTimeout: () => { cleared = true; },
  });
  const controller = new AbortController();
  const pending = b.api.requestGoogleAccountSession(clientId, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /中断/);
  assert.equal(cleared, true);
  callback({ access_token: "late-token", expires_in: 3600 });
  await assert.rejects(pending, /中断/);
});

test("a late OAuth callback after timeout cannot resume the expired submission or resolve a retry", async () => {
  const clients = [];
  const deadlines = [];
  const b = browser({
    window: { google: { accounts: { oauth2: { initTokenClient: (options) => { clients.push(options); return { requestAccessToken() {} }; } } } } },
    setTimeout: (callback) => { deadlines.push(callback); return deadlines.length; }, clearTimeout() {},
  });
  const expired = b.api.requestGoogleAccountToken(clientId);
  deadlines[0]();
  await assert.rejects(expired, /時間切れ/);
  let retryResolved = false;
  const retry = b.api.requestGoogleAccountToken(clientId).then((value) => { retryResolved = true; return value; });
  clients[0].callback({ access_token: "expired-flow-token" });
  await Promise.resolve();
  assert.equal(retryResolved, false);
  clients[1].callback({ access_token: "retry-token" });
  assert.equal(await retry, "retry-token");
});

test("photo preparation falls back to the phone image decoder and recompresses oversized JPEGs", async () => {
  const b = browser({ createImageBitmap: async () => { throw new Error("unsupported phone codec"); }, window: { Image: class {
    naturalWidth = 4032; naturalHeight = 3024;
    set src(value) { assert.equal(value, "blob:synthetic"); queueMicrotask(() => this.onload()); }
  } } });
  let encodes = 0;
  b.canvas.toBlob = (callback, type) => { callback(new Blob([++encodes === 1 ? new Uint8Array(1_600_000) : withExif()], { type })); };
  const photo = await b.api.sanitizeTrainingPhoto(new Blob(["synthetic"], { type: "image/heic" }));
  assert.equal(photo.type, "image/jpeg");
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), baselineJpeg);
  assert.equal(encodes, 2);
  assert.deepEqual(b.revoked, ["blob:synthetic"]);
});

function controlledTimers() {
  const pending = new Map();
  let sequence = 0;
  return {
    setTimeout: (callback, delay) => { const id = ++sequence; pending.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => pending.delete(id),
    expirePhotoOperation() {
      const entry = [...pending.values()].find((value) => value.delay === 15_000);
      assert.ok(entry, "a bounded photo operation is pending");
      entry.callback();
    },
  };
}

test("a stalled bitmap decoder falls back and closes its late result", async () => {
  const timers = controlledTimers();
  let returnBitmap;
  let closed = 0;
  const b = browser({ ...timers, createImageBitmap: () => new Promise((resolve) => { returnBitmap = resolve; }), window: { Image: class {
    naturalWidth = 800; naturalHeight = 600;
    set src(_) { queueMicrotask(() => this.onload()); }
  } } });
  const preparing = b.api.sanitizeTrainingPhoto(new Blob(["synthetic"]));
  timers.expirePhotoOperation();
  assert.equal((await preparing).type, "image/jpeg");
  returnBitmap({ width: 800, height: 600, close() { closed++; } });
  await Promise.resolve();
  assert.equal(closed, 1);
  assert.deepEqual(b.revoked, ["blob:synthetic"]);
});

test("a canvas encoder that never calls back rejects instead of leaving sharing busy", async () => {
  const timers = controlledTimers();
  const b = browser(timers);
  let reachedCanvas;
  const ready = new Promise((resolve) => { reachedCanvas = resolve; });
  b.canvas.toBlob = () => reachedCanvas();
  const preparing = b.api.sanitizeTrainingPhoto(new Blob(["synthetic"]));
  await ready;
  timers.expirePhotoOperation();
  await assert.rejects(preparing, /写真を送信用に変換できませんでした/);
  assert.equal(b.canvas.width, 0);
  assert.equal(b.canvas.height, 0);
});

test("photo selection accepts empty MIME phone files only with an image extension", () => {
  const b = browser();
  assert.equal(b.api.isSupportedFoodPhoto({ type: "", name: "IMG_0001.HEIC", size: 2000 }), true);
  assert.equal(b.api.isSupportedFoodPhoto({ type: "", name: "document.txt", size: 2000 }), false);
  assert.equal(b.api.isSupportedFoodPhoto({ type: "image/jpeg", name: "a.jpg", size: 20_000_001 }), false);
});

test("connection checks the deployed receiver and OAuth configuration before sharing", async () => {
  let configuration = { ok: true, service: "bodymake-training-ingest", schemaVersion: 2, clientId };
  const b = browser({ fetch: async () => ({ ok: true, json: async () => configuration }) });
  await b.api.checkTrainingConnection(endpoint, clientId);
  configuration = { ...configuration, clientId: "another-client" };
  await assert.rejects(b.api.checkTrainingConnection(endpoint, clientId), /準備が完了していません/);
});

test("connection failures expose fixed messages without browser response details", () => {
  const b = browser();
  const timeout = new Error("sensitive browser detail");
  timeout.name = "AbortError";
  assert.match(b.api.trainingConnectionError(timeout), /時間切れ/);
  assert.doesNotMatch(b.api.trainingConnectionError(new Error("remote response fragment")), /remote response/);
});

test("readiness retries a transient mobile failure once without sending credentials or photos", async () => {
  for (const name of ["AbortError", "TypeError", "SyntaxError"]) {
    let requests = 0;
    const b = browser({ fetch: async (url, options) => {
      requests++;
      assert.equal(url, endpoint);
      assert.equal(options.credentials, "omit");
      assert.equal(options.body, undefined);
      assert.equal(options.headers, undefined);
      if (requests === 1) throw Object.assign(new Error("temporary"), { name });
      return { ok: true, json: async () => ({ ok: true, service: "bodymake-training-ingest", schemaVersion: 2, clientId }) };
    } });
    await b.api.checkTrainingConnection(endpoint, clientId);
    assert.equal(requests, 2);
  }
});

test("readiness retries are bounded and never bypass an OAuth configuration mismatch", async () => {
  let requests = 0;
  const b = browser({ fetch: async () => { requests++; throw Object.assign(new Error("offline"), { name: "TypeError" }); } });
  await assert.rejects(b.api.checkTrainingConnection(endpoint, clientId));
  assert.equal(requests, 2);
  requests = 0;
  b.context.fetch = async () => { requests++; return { ok: true, json: async () => ({ ok: true, service: "bodymake-training-ingest", schemaVersion: 2, clientId: "wrong-client" }) }; };
  await assert.rejects(b.api.checkTrainingConnection(endpoint, clientId), /準備が完了していません/);
  assert.equal(requests, 1);
});

test("slow readiness requests get two bounded 45-second attempts, and cancellation stops retries", async () => {
  const timers = new Map();
  let sequence = 0;
  let requests = 0;
  const b = browser({
    setTimeout(callback, delay) { assert.equal(delay, 45_000); const id = ++sequence; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (_, options) => { requests++; return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))); },
  });
  const controller = new AbortController();
  const checking = b.api.checkTrainingConnection(endpoint, clientId, controller.signal);
  [...timers.values()][0]();
  for (let i = 0; i < 6; i++) await Promise.resolve();
  assert.equal(requests, 2);
  controller.abort();
  await assert.rejects(checking, { name: "AbortError" });
  assert.equal(requests, 2);
  assert.equal(timers.size, 0);
  await assert.rejects(b.api.checkTrainingConnection(endpoint, clientId, controller.signal), { name: "AbortError" });
  assert.equal(requests, 2);
});

test("temporary HTTP readiness failures recover but permanent HTTP errors do not retry", async () => {
  for (const status of [408, 429, 503, 403]) {
    let requests = 0;
    const b = browser({ fetch: async () => {
      requests++;
      return requests === 1 ? { ok: false, status, json: async () => ({}) }
        : { ok: true, json: async () => ({ ok: true, service: "bodymake-training-ingest", schemaVersion: 2, clientId }) };
    } });
    if (status === 403) { await assert.rejects(b.api.checkTrainingConnection(endpoint, clientId)); assert.equal(requests, 1); }
    else { await b.api.checkTrainingConnection(endpoint, clientId); assert.equal(requests, 2); }
  }
});

const input = {
  endpoint, accessToken: "synthetic-token", id: "synthetic-submission-123", image: new Blob(["synthetic"]),
  predictedFoodIds: [], confirmedFoodId: "rice", confirmedFoodName: "ご飯",
  nutrition: { calories: 100, proteinG: 1, fatG: 1, carbsG: 20 },
  createdAt: "2026-10-21T00:00:00Z", consent: true,
};

test("FileReader abort and error settle photo submission without a network request", async () => {
  for (const event of ["onabort", "onerror"]) {
    let requests = 0;
    const b = browser({
      FileReader: class { readAsDataURL() { queueMicrotask(() => this[event]()); } },
      fetch: async () => { requests++; throw new Error("must not send an unread photo"); },
    });
    await assert.rejects(b.api.submitFoodCorrectionToSharedDrive(input), /写真を送信用に変換できませんでした/);
    assert.equal(requests, 0);
  }
});

test("a FileReader that never calls back is aborted and times out once", async () => {
  const timers = controlledTimers();
  let reachedReader;
  const ready = new Promise((resolve) => { reachedReader = resolve; });
  let aborted = 0;
  const b = browser({ ...timers, FileReader: class {
    readAsDataURL() { reachedReader(); }
    abort() { aborted++; this.onabort?.(); }
  } });
  const sending = b.api.submitFoodCorrectionToSharedDrive(input);
  await ready;
  timers.expirePhotoOperation();
  await assert.rejects(sending, /写真を送信用に変換できませんでした/);
  assert.equal(aborted, 1);
});

test("an interrupted upload retries the exact request bytes and verifies its receipt", async () => {
  const requests = [];
  const b = browser({ fetch: async (_, options) => {
    requests.push(options.body);
    if (requests.length === 1) throw new Error("connection dropped after server saved");
    const { payload } = JSON.parse(options.body);
    return { ok: true, type: "cors", json: async () => ({ ok: true, id: payload.id, imageSha256: payload.imageSha256, imageFileId: "image-file-123", jsonFileId: "label-file-123" }) };
  } });
  b.canvas.toBlob = (callback, type) => {
    b.encoded.push(true);
    callback(new Blob([withExif()], { type }));
  };
  const receipt = await b.api.submitFoodCorrectionToSharedDrive(input);
  assert.equal(receipt.id, input.id);
  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);
  assert.equal(b.encoded.length, 1);
  const { payload } = JSON.parse(requests[0]);
  assert.deepEqual(Buffer.from(payload.imageBase64, "base64"), baselineJpeg);
  assert.equal(payload.imageSha256, Buffer.from(await webcrypto.subtle.digest("SHA-256", baselineJpeg)).toString("hex"));
});

test("an unreadable encoded JPEG is never posted, and its decoded pixels are released", async () => {
  let requests = 0, closed = 0;
  const b = browser({
    createImageBitmap: async () => ({ width: 800, height: 600, close() { closed++; } }),
    fetch: async () => { requests++; throw new Error("must not upload unsafe photo"); },
  });
  b.canvas.toBlob = (callback, type) => callback(new Blob([baselineJpeg.subarray(0, -2)], { type }));
  await assert.rejects(b.api.submitFoodCorrectionToSharedDrive(input), /写真の安全な変換を確認できませんでした/);
  assert.equal(requests, 0);
  assert.equal(closed, 1);
  assert.equal(b.canvas.width, 0);
  assert.equal(b.canvas.height, 0);
});

test("the current client accepts a verified v3 sanitized-image receipt", async () => {
  const b = browser({ fetch: async (_, options) => {
    const { payload } = JSON.parse(options.body);
    return { ok: true, type: "cors", json: async () => ({ ok: true, receiptVersion: 3,
      id: payload.id, imageSha256: payload.imageSha256, requestImageSha256: payload.imageSha256,
      storedImageSha256: payload.imageSha256, sanitization: "jpeg-metadata-v1", metadataRemoved: false,
      imageFileId: "image-file-123", jsonFileId: "label-file-123" }) };
  } });
  const receipt = await b.api.submitFoodCorrectionToSharedDrive(input);
  assert.equal(receipt.id, input.id);
  assert.equal(receipt.imageSha256, Buffer.from(await webcrypto.subtle.digest("SHA-256", baselineJpeg)).toString("hex"));
});

test("explicit authentication rejection is not automatically reposted", async () => {
  let requests = 0;
  const b = browser({ fetch: async () => {
    requests++;
    return { ok: true, type: "cors", json: async () => ({ ok: false, errorCode: "wrong_google_client", stage: "google_account" }) };
  } });
  await assert.rejects(b.api.submitFoodCorrectionToSharedDrive(input), /wrong_google_client/);
  assert.equal(requests, 1);
});
