import assert from "node:assert/strict";
import test from "node:test";
import { createMealPresenceReader } from "./firestore.mjs";

const account = "meal-reminders@bodymake-test-14a3f.iam.gserviceaccount.com";
const tokenUrl = "https://oauth2.googleapis.com/token";
const queryUrl = "https://firestore.googleapis.com/v1/projects/bodymake-test-14a3f/databases/(default)/documents/users/test-user:runAggregationQuery";
const initialTime = Date.parse("2026-11-26T03:00:00Z");
const keyPair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256" },
  true, ["sign", "verify"],
);
const privatePem = Buffer.from(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)).toString("base64");
const makeCredentials = (client_email = account) => JSON.stringify({
  client_email,
  private_key: "-----BEGIN PRIVATE KEY-----\n" + privatePem.match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----\n",
});
const tokenResponse = (value = "token-1") => Response.json({ access_token: value, token_type: "Bearer", expires_in: 3600 });
const countResponse = (value) => Response.json([
  { readTime: "2026-11-26T03:00:00Z" },
  { result: { aggregateFields: { matches: { integerValue: value } } } },
]);

test("requests only the existence count for the user's test-project day and meal", async () => {
  const hasMeal = createMealPresenceReader({
    credentials: makeCredentials(),
    now: () => initialTime,
    fetcher: async (url, options) => {
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "error");
      if (url === tokenUrl) {
        assert.equal(options.body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
        const [head, claims, signature] = options.body.get("assertion").split(".");
        assert.deepEqual(JSON.parse(Buffer.from(head, "base64url")), { alg: "RS256", typ: "JWT" });
        assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url")), {
          iss: account, aud: tokenUrl, scope: "https://www.googleapis.com/auth/datastore",
          iat: initialTime / 1000, exp: initialTime / 1000 + 300,
        });
        assert.ok(await crypto.subtle.verify(
          "RSASSA-PKCS1-v1_5", keyPair.publicKey, Buffer.from(signature, "base64url"), Buffer.from(head + "." + claims),
        ));
        return tokenResponse();
      }
      assert.equal(url, queryUrl);
      assert.equal(options.headers.Authorization, "Bearer token-1");
      assert.deepEqual(JSON.parse(options.body), {
        structuredAggregationQuery: {
          structuredQuery: {
            from: [{ collectionId: "meals" }],
            where: { compositeFilter: { op: "AND", filters: [
              { fieldFilter: { field: { fieldPath: "recordedAt" }, op: "EQUAL", value: { stringValue: "2026-11-26" } } },
              { fieldFilter: { field: { fieldPath: "mealType" }, op: "EQUAL", value: { stringValue: "lunch" } } },
            ] } },
            limit: 1,
          },
          aggregations: [{ count: {}, alias: "matches" }],
        },
      });
      return countResponse("1");
    },
  });
  assert.equal(await hasMeal("test-user", "2026-11-26", "lunch"), true);
});

test("a valid absence returns false and concurrent lookups share an OAuth exchange", async () => {
  let clock = initialTime;
  let exchanges = 0;
  const hasMeal = createMealPresenceReader({
    credentials: makeCredentials(),
    now: () => clock,
    fetcher: async (url, options) => {
      if (url === tokenUrl) return tokenResponse("token-" + ++exchanges);
      assert.equal(url, queryUrl);
      assert.equal(options.headers.Authorization, "Bearer token-" + exchanges);
      return countResponse("0");
    },
  });
  assert.deepEqual(await Promise.all([
    hasMeal("test-user", "2026-11-26", "breakfast"),
    hasMeal("test-user", "2026-11-26", "dinner"),
  ]), [false, false]);
  assert.equal(exchanges, 1);
  clock += 3600 * 1000;
  assert.equal(await hasMeal("test-user", "2026-11-26", "dinner"), false);
  assert.equal(exchanges, 2);
});

test("permission failures, malformed results and transport failures do not mean missing", async () => {
  const queryResults = [
    () => new Response(null, { status: 401 }),
    () => new Response(null, { status: 403 }),
    () => Response.json([]),
    () => countResponse("2"),
    () => { throw new Error("Network unavailable"); },
    () => countResponse("1"),
  ];
  let exchanges = 0;
  const hasMeal = createMealPresenceReader({
    credentials: makeCredentials(),
    fetcher: async url => {
      if (url === tokenUrl) return tokenResponse("token-" + ++exchanges);
      assert.equal(url, queryUrl);
      return queryResults.shift()();
    },
  });
  for (let i = 0; i < 5; i++) await assert.rejects(hasMeal("test-user", "2026-11-26", "dinner"));
  assert.equal(await hasMeal("test-user", "2026-11-26", "dinner"), true);
  assert.equal(exchanges, 2);
});

test("rejects non-test credentials, invalid lookup inputs and bad OAuth results", async () => {
  const noNetwork = () => assert.fail("Invalid inputs must not fetch");
  assert.throws(() => createMealPresenceReader({
    credentials: makeCredentials("meal-reminders@healthapp-14a3f.iam.gserviceaccount.com"),
    fetcher: noNetwork,
  }), /shared-test service account/);
  const read = createMealPresenceReader({ credentials: makeCredentials(), fetcher: noNetwork });
  await assert.rejects(read("user/../other", "2026-11-26", "dinner"), /Invalid meal reminder lookup/);
  await assert.rejects(read("test-user", "2026-02-30", "dinner"), /Invalid meal reminder lookup/);
  await assert.rejects(read("test-user", "2026-11-26", "snack"), /Invalid meal reminder lookup/);
  const invalidOAuth = createMealPresenceReader({
    credentials: makeCredentials(),
    fetcher: async url => {
      assert.equal(url, tokenUrl);
      return Response.json({ access_token: "token with spaces", expires_in: 3600, token_type: "Bearer" });
    },
  });
  await assert.rejects(invalidOAuth("test-user", "2026-11-26", "dinner"), /authorization response/);
});

test("checks only the enabled field of the exact-case test access document", async () => {
  const email = "Test+Reminder@Example.COM";
  const expectedPath = "https://firestore.googleapis.com/v1/projects/bodymake-test-14a3f/databases/(default)/documents/developerAccess/Test%2BReminder%40Example.COM?mask.fieldPaths=enabled";
  const accessResults = [
    () => Response.json({ fields: { enabled: { booleanValue: true } } }),
    () => Response.json({ fields: { enabled: { booleanValue: false } } }),
    () => new Response(null, { status: 404 }),
    () => new Response(null, { status: 403 }),
    () => Response.json({ fields: {} }),
    () => { throw new Error("Access lookup network unavailable"); },
  ];
  let exchanges = 0;
  const hasMeal = createMealPresenceReader({
    credentials: makeCredentials(),
    fetcher: async (url, options) => {
      if (url === tokenUrl) return tokenResponse("token-" + ++exchanges);
      assert.equal(url, expectedPath);
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Authorization, "Bearer token-1");
      assert.equal(options.headers["Cache-Control"], "no-store");
      return accessResults.shift()();
    },
  });
  assert.equal(await hasMeal.isAllowed(email), true);
  assert.equal(await hasMeal.isAllowed(email), false);
  assert.equal(await hasMeal.isAllowed(email), false);
  await assert.rejects(hasMeal.isAllowed(email), /access lookup failed/);
  await assert.rejects(hasMeal.isAllowed(email), /Invalid meal reminder access response/);
  await assert.rejects(hasMeal.isAllowed(email), /network unavailable/);
  assert.equal(exchanges, 1);
});

test("rejects unsafe access document identifiers before making a request", async () => {
  const hasMeal = createMealPresenceReader({
    credentials: makeCredentials(),
    fetcher: () => assert.fail("Invalid access addresses must not fetch"),
  });
  for (const email of ["", "no-domain", "@example.com", "two@ats@example.com", "x/y@example.com",
    "x\\y@example.com", "x\n@example.com", "x\u0000@example.com", " a@example.com", "x".repeat(321) + "@example.com"]) {
    await assert.rejects(hasMeal.isAllowed(email), /Invalid meal reminder access lookup/);
  }
});
