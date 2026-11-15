import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import { createFirebaseOwnerVerifier, FirebaseAuthError, FIREBASE_RECOMMENDATION_PROJECT } from "./firebase-auth.ts";

// All credentials/claims are synthetic; keys, responses, and caches exist only in RAM.
const { publicKey, privateKey } = await generateKeyPair("RS256");
const alternate = await generateKeyPair("RS256");
const OWNER = "synthetic-owner-uid";
const API_KEY = "synthetic-firebase-project-key-for-tests";
const NOW = 1_793_750_400;
const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const LOOKUP_URL = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`;
const FAKE_PEM = "-----BEGIN CERTIFICATE-----\nSYNTHETIC\n-----END CERTIFICATE-----";
const defaultClaims = () => ({
  iss: `https://securetoken.google.com/${FIREBASE_RECOMMENDATION_PROJECT}`,
  aud: FIREBASE_RECOMMENDATION_PROJECT, sub: OWNER, exp: NOW + 3_500, iat: NOW - 100,
  auth_time: NOW - 1_000, email_verified: true, firebase: { sign_in_provider: "google.com" },
  email: "synthetic@example.invalid", name: "Synthetic only",
});
async function signed(overrides = {}, header = {}, key = privateKey) {
  return new SignJWT({ ...defaultClaims(), ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "test-key-1", ...header }).sign(key);
}
const authorization = (token) => `Bearer ${token}`;
const account = (overrides = {}) => ({ users: [{ localId: OWNER, validSince: String(NOW - 2_000), disabled: false, emailVerified: true, ...overrides }] });
const json = (value, headers = {}, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
const expectCode = (promise, code, status) => assert.rejects(promise, (error) => {
  assert.ok(error instanceof FirebaseAuthError);
  assert.equal(error.message, code);
  assert.equal(error.code, code);
  if (status !== undefined) assert.equal(error.status, status);
  assert.equal(error.cause, undefined);
  return true;
});

function harness({ config = {}, dependencies = {}, lookup = () => json(account()) } = {}) {
  const calls = [];
  const verifier = createFirebaseOwnerVerifier({ ownerUid: OWNER, firebaseApiKey: API_KEY, ...config }, {
    now: () => NOW * 1_000,
    resolveKey: async (kid) => {
      assert.equal(kid, "test-key-1");
      return publicKey;
    },
    fetch: async (url, init) => { calls.push({ url, init }); assert.equal(url, LOOKUP_URL); return lookup(url, init); },
    ...dependencies,
  });
  return { verifier, calls };
}

test("verified owner returns only UID and uses one fixed, no-retry lookup", async () => {
  const { verifier, calls } = harness();
  const token = await signed();
  assert.deepEqual(await verifier(authorization(token)), { uid: OWNER });
  assert.equal(calls.length, 1);
  const { init } = calls[0];
  assert.equal(init.method, "POST");
  assert.equal(init.redirect, "error");
  assert.equal(init.credentials, "omit");
  assert.equal(init.cache, "no-store");
  assert.deepEqual(JSON.parse(init.body), { idToken: token });
  assert.deepEqual(init.headers, { "Content-Type": "application/json" });
  assert.ok(init.signal instanceof AbortSignal);
});

test("missing/invalid owner or API configuration never calls external services", async () => {
  for (const config of [
    { ownerUid: undefined }, { ownerUid: "" }, { ownerUid: " leading-space" }, { ownerUid: "x".repeat(129) },
    { firebaseApiKey: undefined }, { firebaseApiKey: "" }, { firebaseApiKey: "https://attacker.invalid/secret" },
  ]) {
    const { verifier, calls } = harness({ config });
    await expectCode(verifier(authorization(await signed())), "auth_not_configured", 503);
    assert.equal(calls.length, 0);
  }
});

test("missing, oversized, malformed, multi-token and non-Bearer authorization fail before lookup", async () => {
  const { verifier, calls } = harness();
  for (const value of [null, ""]) await expectCode(verifier(value), "auth_required", 401);
  for (const value of [42, "Basic abc", "Bearer abc", "Bearer a.b.c, Bearer d.e.f", `Bearer ${"a".repeat(8_193)}`, "Bearer a.b.c\n", "Bearer  a.b.c"]) {
    await expectCode(verifier(value), "invalid_auth_token", 401);
  }
  assert.equal(calls.length, 0);
});

test("required and strict Firebase claims reject synthetic unsafe identities before lookup", async (t) => {
  const cases = [
    ["wrong project", { aud: "bodymake-test-14a3f" }],
    ["audience array", { aud: [FIREBASE_RECOMMENDATION_PROJECT] }],
    ["wrong issuer", { iss: "https://attacker.invalid" }],
    ["empty subject", { sub: "" }], ["long subject", { sub: "x".repeat(129) }],
    ["control subject", { sub: "a\nb" }], ["nonstring subject", { sub: 123 }],
    ["expired", { exp: NOW }], ["future issued", { iat: NOW + 1 }],
    ["future authenticated", { auth_time: NOW + 1 }],
    ["authentication after issue", { auth_time: NOW - 99 }],
    ["fractional issued", { iat: NOW - 1.5 }], ["string issued", { iat: String(NOW) }],
    ["negative authentication", { auth_time: -1 }], ["string authentication", { auth_time: String(NOW) }],
    ["long lived", { exp: NOW + 3_501 }], ["expiration before issue", { exp: NOW - 101 }],
    ["unverified email", { email_verified: false }], ["string verification", { email_verified: "true" }],
    ["other provider", { firebase: { sign_in_provider: "password" } }],
    ["anonymous provider", { firebase: { sign_in_provider: "anonymous" } }],
    ["unknown tenant", { firebase: { sign_in_provider: "google.com", tenant: "unexpected" } }],
    ["nonobject provider", { firebase: [] }],
    ...["iss", "aud", "sub", "exp", "iat", "auth_time", "email_verified", "firebase"].map((key) => [`missing ${key}`, { [key]: undefined }]),
  ];
  for (const [name, claims] of cases) await t.test(name, async () => {
    const { verifier, calls } = harness();
    let paidCalls = 0;
    await expectCode(verifier(authorization(await signed(claims))).then(() => { paidCalls += 1; }), "invalid_auth_token", 401);
    assert.equal(calls.length, 0);
    assert.equal(paidCalls, 0);
  });
});

test("another valid UID cannot use the owner pilot or trigger account lookup", async () => {
  const { verifier, calls } = harness();
  await expectCode(verifier(authorization(await signed({ sub: "another-synthetic-user" }))), "auth_owner_only", 403);
  assert.equal(calls.length, 0);
});

test("signature tampering, alternate key, missing kid and token-supplied key URLs are refused", async () => {
  const { verifier, calls } = harness();
  const token = await signed();
  const parts = token.split(".");
  parts[1] = Buffer.from(JSON.stringify({ ...defaultClaims(), sub: "tampered" })).toString("base64url");
  await expectCode(verifier(authorization(parts.join("."))), "invalid_auth_token");
  await expectCode(verifier(authorization(await signed({}, {}, alternate.privateKey))), "invalid_auth_token");
  for (const header of [{ kid: undefined }, { kid: "https://attacker.invalid" }, { jku: "https://attacker.invalid" }, { x5u: "https://attacker.invalid" }, { jwk: {} }, { x5c: [] }]) {
    await expectCode(verifier(authorization(await signed({}, header))), "invalid_auth_token");
  }
  const none = `${Buffer.from(JSON.stringify({ alg: "none", kid: "test-key-1" })).toString("base64url")}.${parts[1]}.x`;
  await expectCode(verifier(authorization(none)), "invalid_auth_token");
  const hs256 = await new SignJWT(defaultClaims()).setProtectedHeader({ alg: "HS256", kid: "test-key-1" }).sign(new Uint8Array(32));
  await expectCode(verifier(authorization(hs256)), "invalid_auth_token");
  assert.equal(calls.length, 0);
});

test("revocation uses auth_time, not newly refreshed iat; exact validSince equality is accepted", async () => {
  for (const user of [{ validSince: String(NOW - 999) }, { disabled: true }]) {
    const { verifier } = harness({ lookup: () => json(account(user)) });
    await expectCode(verifier(authorization(await signed({ iat: NOW, exp: NOW + 3_600 }))), "auth_revoked", 401);
  }
  const { verifier } = harness({ lookup: () => json(account({ validSince: String(NOW - 1_000) })) });
  assert.deepEqual(await verifier(authorization(await signed())), { uid: OWNER });
});

test("missing, malformed, mismatched account fields never infer revocation success", async (t) => {
  const cases = [
    {}, { users: [] }, { users: [account().users[0], account().users[0]] }, { users: [null] },
    ...[
      { localId: "other" }, { localId: undefined }, { disabled: undefined }, { disabled: "false" },
      { emailVerified: undefined }, { emailVerified: false }, { validSince: undefined },
      { validSince: NOW - 2_000 }, { validSince: "-1" }, { validSince: "123.5" }, { validSince: "NaN" },
      { validSince: "9999999999999999" },
    ].map(account),
  ];
  for (let index = 0; index < cases.length; index += 1) await t.test(String(index), async () => {
    const { verifier, calls } = harness({ lookup: () => json(cases[index]) });
    let paidCalls = 0;
    await expectCode(verifier(authorization(await signed())).then(() => { paidCalls += 1; }), "auth_unavailable", 503);
    assert.equal(calls.length, 1);
    assert.equal(paidCalls, 0);
  });
});

test("upstream failures, redirects, content types and bounded bodies fail closed without raw errors", async (t) => {
  const cases = [
    () => { throw new Error("synthetic token/key/upstream private detail"); },
    () => json({ error: { message: "INVALID_ID_TOKEN private detail" } }, {}, 400),
    () => json({}, {}, 429), () => json({}, {}, 503),
    () => new Response(null, { status: 302, headers: { Location: "https://attacker.invalid" } }),
    () => new Response("<html>secret</html>", { headers: { "content-type": "text/html" } }),
    () => new Response("broken private JSON", { headers: { "content-type": "application/json" } }),
    () => json(account(), { "content-length": "65537" }),
    () => json(account(), { "content-length": "bad" }),
    () => json({ ...account(), extra: "x".repeat(65_536) }),
    () => new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
  ];
  for (let index = 0; index < cases.length; index += 1) await t.test(String(index), async () => {
    const { verifier, calls } = harness({ lookup: cases[index] });
    await expectCode(verifier(authorization(await signed())), "auth_unavailable", 503);
    assert.equal(calls.length, 1);
  });
});

test("timeout includes headers and stalled body and does not retry", async (t) => {
  for (const mode of ["headers", "body"]) await t.test(mode, async () => {
    let signal;
    let bodyCancelled = false;
    const { verifier, calls } = harness({
      dependencies: { timeoutMs: 10 },
      lookup: (_, init) => {
        signal = init.signal;
        if (mode === "headers") return new Promise(() => {});
        return new Response(new ReadableStream({ cancel() { bodyCancelled = true; } }), { headers: { "content-type": "application/json" } });
      },
    });
    await expectCode(verifier(authorization(await signed())), "auth_unavailable");
    assert.equal(signal.aborted, true);
    if (mode === "body") assert.equal(bodyCancelled, true);
    assert.equal(calls.length, 1);
  });
});

test("token expiring during lookup is rejected before returning authorization", async () => {
  let clock = NOW * 1_000;
  const { verifier } = harness({ dependencies: { now: () => clock }, lookup: () => { clock += 2_000; return json(account()); } });
  await expectCode(verifier(authorization(await signed({ exp: NOW + 1 }))), "invalid_auth_token");
});

function certificateHarness({ certificateResponse, importCertificate, now, lookup } = {}) {
  let clock = NOW * 1_000;
  let imports = 0;
  const calls = [];
  const verifier = createFirebaseOwnerVerifier({ ownerUid: OWNER, firebaseApiKey: API_KEY }, {
    now: now ?? (() => clock),
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url === CERT_URL) return certificateResponse ? certificateResponse() : json({ "test-key-1": FAKE_PEM }, { "cache-control": "public, max-age=3600" });
      assert.equal(url, LOOKUP_URL);
      return lookup ? lookup() : json(account());
    },
    importCertificate: importCertificate ?? (async (pem, alg) => { imports += 1; assert.equal(pem, FAKE_PEM); assert.equal(alg, "RS256"); return publicKey; }),
  });
  return { verifier, calls, imports: () => imports, advance: (ms) => { clock += ms; } };
}

test("fixed Google certificate source and imported CryptoKey are cached in RAM, lookup is never cached", async () => {
  const h = certificateHarness();
  const token = await signed();
  await h.verifier(authorization(token));
  await h.verifier(authorization(token));
  assert.equal(h.calls.filter(({ url }) => url === CERT_URL).length, 1);
  assert.equal(h.calls.filter(({ url }) => url === LOOKUP_URL).length, 2);
  assert.equal(h.imports(), 1);
  assert.equal(h.calls[0].init.method, "GET");
});

test("concurrent cold requests share a single certificate fetch and import", async () => {
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  const h = certificateHarness({ certificateResponse: async () => { await ready; return json({ "test-key-1": FAKE_PEM }, { "cache-control": "max-age=3600" }); } });
  const token = await signed();
  const pending = [h.verifier(authorization(token)), h.verifier(authorization(token))];
  release();
  await Promise.all(pending);
  assert.equal(h.calls.filter(({ url }) => url === CERT_URL).length, 1);
  assert.equal(h.imports(), 1);
});

test("unknown kids cannot generate a fetch per request; rotation refresh after cooldown is bounded", async () => {
  let rotated = false;
  const h = certificateHarness({ certificateResponse: () => json({ [rotated ? "test-key-2" : "test-key-1"]: FAKE_PEM }, { "cache-control": "max-age=3600" }) });
  await h.verifier(authorization(await signed()));
  for (const kid of ["unknown-1", "unknown-2", "unknown-3"]) await expectCode(h.verifier(authorization(await signed({}, { kid }))), "invalid_auth_token");
  assert.equal(h.calls.filter(({ url }) => url === CERT_URL).length, 1);
  rotated = true;
  h.advance(60_001);
  await h.verifier(authorization(await signed({}, { kid: "test-key-2" })));
  assert.equal(h.calls.filter(({ url }) => url === CERT_URL).length, 2);
});

test("expired certificates and failed refresh never fall back to a stale key", async () => {
  let fail = false;
  const h = certificateHarness({ certificateResponse: () => fail ? json({}, {}, 503) : json({ "test-key-1": FAKE_PEM }, { "cache-control": "max-age=60" }) });
  const token = await signed();
  await h.verifier(authorization(token));
  h.advance(60_001); fail = true;
  await expectCode(h.verifier(authorization(token)), "auth_unavailable");
  await expectCode(h.verifier(authorization(token)), "auth_unavailable");
  assert.equal(h.calls.filter(({ url }) => url === LOOKUP_URL).length, 1);
  assert.equal(h.calls.filter(({ url }) => url === CERT_URL).length, 2);
});

test("invalid certificates, missing/expired cache policy and import failure are closed", async (t) => {
  const responses = [
    () => json({ "test-key-1": FAKE_PEM }),
    () => json({ "test-key-1": FAKE_PEM }, { "cache-control": "max-age=0" }),
    () => json({ "test-key-1": FAKE_PEM }, { "cache-control": "max-age=60, max-age=600" }),
    () => json({ "test-key-1": FAKE_PEM }, { "cache-control": "no-store, max-age=600" }),
    () => json({ "test-key-1": FAKE_PEM }, { "cache-control": "no-cache, max-age=600" }),
    () => json({ "test-key-1": FAKE_PEM }, { "cache-control": "max-age=60", age: "60" }),
    () => json({ "test-key-1": FAKE_PEM }, { "cache-control": "max-age=60", age: "invalid" }),
    () => json({}, { "cache-control": "max-age=60" }),
    () => json({ "test-key-1": "not a certificate" }, { "cache-control": "max-age=60" }),
    () => json(Array(2).fill(FAKE_PEM), { "cache-control": "max-age=60" }),
  ];
  for (let index = 0; index < responses.length; index += 1) await t.test(String(index), async () => {
    const h = certificateHarness({ certificateResponse: responses[index] });
    await expectCode(h.verifier(authorization(await signed())), "auth_unavailable");
    assert.equal(h.calls.filter(({ url }) => url === LOOKUP_URL).length, 0);
  });
  const h = certificateHarness({ importCertificate: async () => { throw new Error("synthetic private details"); } });
  await expectCode(h.verifier(authorization(await signed())), "auth_unavailable");
});

test("untrusted key resolver errors are sanitized and do not reach lookup", async () => {
  const { verifier, calls } = harness({ dependencies: { resolveKey: async () => { throw new Error("synthetic secret"); } } });
  await expectCode(verifier(authorization(await signed())), "auth_unavailable");
  assert.equal(calls.length, 0);
});
