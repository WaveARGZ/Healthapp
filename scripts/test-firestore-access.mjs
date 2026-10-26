import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs,
  getFirestore, setDoc, setLogLevel, terminate, updateDoc,
} from "firebase/firestore";

// This test never loads application configuration or Google credentials.
// It refuses every host except an explicitly configured loopback emulator.
const projectId = "demo-bodymake-test";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
assert.match(emulatorHost, /^(127\.0\.0\.1|localhost):\d+$/,
  "Set FIRESTORE_EMULATOR_HOST to a loopback Firestore emulator, never a cloud project.");
const [host, portText] = emulatorHost.split(":");
const port = Number(portText);
assert.ok(port > 0 && port <= 65535, "Invalid Firestore emulator port.");
const baseUrl = `http://${host}:${port}`;
const documentsUrl = `${baseUrl}/v1/projects/${projectId}/databases/(default)/documents`;
const clients = [];
// Expected permission-denied cases must not flood CI output with SDK warnings.
setLogLevel("silent");
const people = [1, 2, 3].map((number) => ({
  uid: `developer-${number}`,
  email: `developer-${number}@example.invalid`,
}));

async function emulatorRequest(path, method, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(response.ok, `Emulator setup failed (${response.status}): ${await response.text()}`);
}

async function grant(email, value = { booleanValue: true }) {
  const url = `${documentsUrl}/developerAccess/${encodeURIComponent(email)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: { enabled: value } }),
  });
  assert.ok(response.ok, `Emulator grant failed: ${response.status}`);
}

function client(person, overrides = {}) {
  const app = initializeApp({ projectId, apiKey: "emulator-only" }, `rules-test-${clients.length}`);
  const db = getFirestore(app);
  const options = person ? {
    mockUserToken: {
      sub: person.uid,
      email: person.email,
      email_verified: true,
      firebase: { sign_in_provider: "google.com", identities: {} },
      ...overrides,
    },
  } : undefined;
  connectFirestoreEmulator(db, host, port, options);
  clients.push({ app, db });
  return db;
}

async function denied(operation) {
  await assert.rejects(operation, (error) => error.code === "permission-denied");
}

test("shared-test Firestore enforces the private developer allowlist", { timeout: 30_000 }, async (t) => {
  const rules = await readFile(new URL("../firestore.test.rules", import.meta.url), "utf8");
  await emulatorRequest(`/emulator/v1/projects/${projectId}:securityRules`, "PUT", {
    rules: { files: [{ name: "firestore.test.rules", content: rules }] },
  });
  await emulatorRequest(`/emulator/v1/projects/${projectId}/databases/(default)/documents`, "DELETE");
  t.after(async () => {
    await Promise.all(clients.map(async ({ app, db }) => {
      await terminate(db);
      await deleteApp(app);
    }));
  });

  const databases = people.map((person) => client(person));
  const first = databases[0];
  const ownRecord = doc(first, "users/developer-1/meals/test-meal");

  await t.test("an empty allowlist denies data, even for a verified Google user", async () => {
    assert.equal((await getDoc(doc(first, "developerAccess", people[0].email))).exists(), false);
    await denied(() => setDoc(ownRecord, { source: "synthetic-test" }));
    await denied(() => getDoc(ownRecord));
  });

  for (const person of people) await grant(person.email);

  await t.test("all three approved developers can CRUD their own records", async () => {
    for (let index = 0; index < people.length; index++) {
      const db = databases[index];
      const record = doc(db, "users", people[index].uid, "meals", "test-meal");
      await setDoc(record, { source: "synthetic-test", value: 1 });
      assert.equal((await getDoc(record)).data().value, 1);
      await updateDoc(record, { value: 2 });
      assert.equal((await getDocs(collection(db, "users", people[index].uid, "meals"))).size, 1);
      await deleteDoc(record);
      assert.equal((await getDoc(record)).exists(), false);
    }
    await setDoc(ownRecord, { source: "synthetic-test" });
    await setDoc(doc(first, "users/developer-1"), { source: "synthetic-profile" });
    assert.equal((await getDoc(doc(first, "users/developer-1"))).exists(), true);
  });

  await t.test("approved users cannot read, query or mutate another developer's records", async () => {
    const otherRecord = doc(databases[1], "users/developer-1/meals/test-meal");
    await denied(() => getDoc(otherRecord));
    await denied(() => getDocs(collection(databases[1], "users/developer-1/meals")));
    await denied(() => setDoc(otherRecord, { source: "cross-user" }));
    await denied(() => deleteDoc(otherRecord));
    await denied(() => getDocs(collection(first, "users")));
  });

  await t.test("anonymous and non-allowlisted users cannot access data", async () => {
    const anonymous = client();
    const outsider = client({ uid: "outsider", email: "outsider@example.invalid" });
    await denied(() => getDoc(doc(anonymous, "users/developer-1/meals/test-meal")));
    await denied(() => setDoc(doc(anonymous, "users/developer-1/meals/test-meal"), {}));
    await denied(() => setDoc(doc(outsider, "users/outsider/meals/test-meal"), {}));
    await denied(() => setDoc(doc(outsider, "developerAccess/outsider@example.invalid"), { enabled: true }));
  });

  await t.test("an allowlisted email requires verification and an actual Google sign-in", async () => {
    for (const overrides of [
      { email_verified: false },
      { firebase: { sign_in_provider: "password", identities: {} } },
      { firebase: { sign_in_provider: "anonymous", identities: {} } },
      { email: null },
      { firebase: {} },
    ]) {
      const db = client(people[0], overrides);
      await denied(() => getDoc(doc(db, "users/developer-1/meals/test-meal")));
      await denied(() => setDoc(doc(db, "users/developer-1/meals/test-meal"), {}));
    }
  });

  await t.test("allowlist is private and clients cannot grant, edit or revoke access", async () => {
    const ownAccess = doc(first, "developerAccess", people[0].email);
    assert.equal((await getDoc(ownAccess)).data().enabled, true);
    await denied(() => getDoc(doc(first, "developerAccess", people[1].email)));
    await denied(() => getDocs(collection(first, "developerAccess")));
    await denied(() => setDoc(ownAccess, { enabled: true }));
    await denied(() => updateDoc(ownAccess, { enabled: false }));
    await denied(() => deleteDoc(ownAccess));
    await denied(() => setDoc(doc(first, "developerAccess/extra@example.invalid"), { enabled: true }));
    await denied(() => setDoc(doc(first, "developerAccess", people[0].email, "nested", "entry"), {}));
  });

  await t.test("unrelated collections stay denied for approved developers", async () => {
    await denied(() => getDoc(doc(first, "private/test")));
    await denied(() => setDoc(doc(first, "private/test"), {}));
  });

  await t.test("disabled or malformed grants block existing users and their existing data", async () => {
    for (const value of [{ booleanValue: false }, { stringValue: "true" }]) {
      await grant(people[0].email, value);
      await denied(() => getDoc(ownRecord));
      await denied(() => setDoc(ownRecord, { source: "after-revocation" }));
    }
    assert.equal((await getDoc(doc(first, "developerAccess", people[0].email))).exists(), true);
  });
});
