import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createCloudflareBudgetStore, initializeCloudflareBudgetStore, assertCloudflareProviderReady, beginCloudflareProviderCall, confirmCloudflareProviderCall } from "./cloudflare-budget-store.ts";
import { invokeWithCumulativeBudget, reserveCumulativeBudget } from "./cumulative-budget.ts";

const META = "bodymake_recommendation_budget_meta";
const RESERVATIONS = "bodymake_recommendation_budget_reservations";
const ATTEMPTS = "bodymake_recommendation_provider_attempts";
const COMPLETIONS = "bodymake_recommendation_provider_completions";
const request = (overrides = {}) => ({ requestId: randomUUID(), subjectHash: "a".repeat(64), inputHash: "b".repeat(64), upperBoundMicros: 1_000_000, ...overrides });
const expectCode = (promise, code) => assert.rejects(promise, (error) => error.code === code && error.message === code);

/** Actual SQLite SQL semantics, but DB/temp storage are exclusively RAM; CF durability is mocked. */
class MemoryCloudflareStorage {
  constructor(t) {
    this.database = new DatabaseSync(":memory:");
    this.database.exec("PRAGMA temp_store = MEMORY");
    t.after(() => this.database.close());
    this.queries = [];
    this.transactions = 0;
    this.syncCalls = 0;
    this.failQuery = null;
    this.failSync = false;
    this.syncBarrier = null;
    this.sql = { exec: (query, ...bindings) => {
      this.queries.push({ query, bindings });
      if (this.failQuery?.(query)) throw new Error("synthetic free-quota/store error must not leak");
      const rows = this.database.prepare(query).all(...bindings);
      return { toArray: () => rows };
    } };
  }
  transactionSync(callback) {
    this.transactions += 1;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      assert.ok(!(result instanceof Promise), "Cloudflare requires a synchronous callback");
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  async sync() {
    this.syncCalls += 1;
    if (this.syncBarrier) await this.syncBarrier;
    if (this.failSync) throw new Error("synthetic acknowledgement lost");
  }
  reserved() { return this.database.prepare(`SELECT reserved_micros FROM ${META}`).get().reserved_micros; }
  rows() { return this.database.prepare(`SELECT * FROM ${RESERVATIONS} ORDER BY ordinal`).all(); }
}

async function initialized(t) {
  const storage = new MemoryCloudflareStorage(t);
  await initializeCloudflareBudgetStore(storage);
  storage.queries = [];
  return storage;
}

test("normal reserve never initializes missing SQL schema or calls a provider", async (t) => {
  const storage = new MemoryCloudflareStorage(t);
  let calls = 0;
  await expectCode(invokeWithCumulativeBudget(createCloudflareBudgetStore(storage), request(), () => { calls += 1; }), "budget_uninitialized");
  assert.equal(calls, 0);
  assert.deepEqual(storage.database.prepare("SELECT name FROM sqlite_master").all(), []);
  assert.equal(storage.syncCalls, 0);
});

test("explicit initialization only accepts a fresh empty schema and awaits sync", async (t) => {
  const storage = new MemoryCloudflareStorage(t);
  let release;
  storage.syncBarrier = new Promise((resolve) => { release = resolve; });
  let complete = false;
  const pending = initializeCloudflareBudgetStore(storage).then(() => { complete = true; });
  await Promise.resolve();
  assert.equal(complete, false);
  release();
  await pending;
  assert.equal(storage.reserved(), 0);
  await expectCode(initializeCloudflareBudgetStore(storage), "budget_initialization_not_empty");
  assert.equal(storage.reserved(), 0);
});

test("existing nonzero, partially missing, or unrelated schema is never reset by initialization", async (t) => {
  const storage = await initialized(t);
  await reserveCumulativeBudget(createCloudflareBudgetStore(storage), request());
  await expectCode(initializeCloudflareBudgetStore(storage), "budget_initialization_not_empty");
  assert.equal(storage.reserved(), 1_000_000);
  storage.database.exec(`DROP TABLE ${RESERVATIONS}`);
  await expectCode(initializeCloudflareBudgetStore(storage), "budget_initialization_not_empty");
  assert.equal(storage.reserved(), 1_000_000);
  const unrelated = new MemoryCloudflareStorage(t);
  unrelated.database.exec("CREATE TABLE unrelated (id INTEGER)");
  await expectCode(initializeCloudflareBudgetStore(unrelated), "budget_initialization_not_empty");
});

test("initialization SQL failure rolls back all schema changes and leaked acknowledgement cannot reset", async (t) => {
  const rollback = new MemoryCloudflareStorage(t);
  rollback.failQuery = (query) => query.startsWith(`CREATE TABLE ${RESERVATIONS}`);
  await expectCode(initializeCloudflareBudgetStore(rollback), "budget_unavailable");
  assert.deepEqual(rollback.database.prepare("SELECT name FROM sqlite_master").all(), []);
  const unknown = new MemoryCloudflareStorage(t); unknown.failSync = true;
  await expectCode(initializeCloudflareBudgetStore(unknown), "budget_unavailable");
  unknown.failSync = false;
  await expectCode(initializeCloudflareBudgetStore(unknown), "budget_initialization_not_empty");
});

test("only append one reservation and update one meta row, with no old reservation rewrite", async (t) => {
  const storage = await initialized(t);
  const first = request();
  await reserveCumulativeBudget(createCloudflareBudgetStore(storage), first);
  const originalRow = storage.rows()[0];
  storage.queries = [];
  await reserveCumulativeBudget(createCloudflareBudgetStore(storage), request());
  const writes = storage.queries.filter(({ query }) => /^(INSERT|UPDATE|DELETE|REPLACE|CREATE)/.test(query));
  assert.equal(writes.length, 2);
  assert.ok(writes[0].query.startsWith(`INSERT INTO ${RESERVATIONS}`));
  assert.ok(writes[1].query.startsWith(`UPDATE ${META}`));
  assert.deepEqual(storage.rows()[0], originalRow);
  assert.equal(storage.reserved(), 2_000_000);
  storage.queries = [];
  assert.equal((await reserveCumulativeBudget(createCloudflareBudgetStore(storage), first)).canCallProvider, false);
  assert.equal(storage.queries.filter(({ query }) => /^(INSERT|UPDATE|DELETE|REPLACE|CREATE)/.test(query)).length, 0);
});

test("provider permission is not released before sync confirms the SQL reservation", async (t) => {
  const storage = await initialized(t);
  let release;
  storage.syncBarrier = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const pending = invokeWithCumulativeBudget(createCloudflareBudgetStore(storage), request(), () => { calls += 1; return "synthetic result"; });
  await Promise.resolve();
  assert.equal(storage.reserved(), 1_000_000);
  assert.equal(calls, 0);
  release();
  assert.equal(await pending, "synthetic result");
  assert.equal(calls, 1);
});

test("SQL/Free quota failures roll back partial appends and never call provider", async (t) => {
  for (const prefix of ["SELECT name", `INSERT INTO ${RESERVATIONS}`, `UPDATE ${META}`]) {
    const storage = await initialized(t);
    storage.failQuery = (query) => query.startsWith(prefix);
    let calls = 0;
    await expectCode(invokeWithCumulativeBudget(createCloudflareBudgetStore(storage), request(), () => { calls += 1; }), "budget_unavailable");
    assert.equal(calls, 0);
    assert.equal(storage.reserved(), 0);
    assert.equal(storage.rows().length, 0);
  }
});

test("sync acknowledgement loss retains reservation; retry after restart never invokes provider", async (t) => {
  const storage = await initialized(t);
  const input = request();
  storage.failSync = true;
  let calls = 0;
  const invoke = () => { calls += 1; };
  await expectCode(invokeWithCumulativeBudget(createCloudflareBudgetStore(storage), input, invoke), "budget_unavailable");
  assert.equal(calls, 0);
  assert.equal(storage.reserved(), 1_000_000);
  storage.failSync = false;
  await expectCode(invokeWithCumulativeBudget(createCloudflareBudgetStore(storage), input, invoke), "budget_duplicate_request");
  assert.equal(calls, 0);
});

test("many adapter instances and subjects use the same SQL ledger and stop at cumulative five dollars", async (t) => {
  const storage = await initialized(t);
  let calls = 0;
  const results = await Promise.allSettled(Array.from({ length: 30 }, (_, index) => invokeWithCumulativeBudget(createCloudflareBudgetStore(storage), request({ subjectHash: index.toString(16).padStart(64, "0"), upperBoundMicros: 500_000 }), () => { calls += 1; })));
  assert.equal(calls, 10);
  assert.equal(results.filter((entry) => entry.status === "fulfilled").length, 10);
  assert.ok(results.filter((entry) => entry.status === "rejected").every((entry) => entry.reason.code === "budget_exhausted"));
  assert.equal(storage.reserved(), 5_000_000);
});

test("parallel duplicate SQL reservations invoke once, and different content conflicts", async (t) => {
  const storage = await initialized(t);
  const input = request();
  let calls = 0;
  const invoke = () => { calls += 1; };
  const results = await Promise.allSettled(Array.from({ length: 15 }, () => invokeWithCumulativeBudget(createCloudflareBudgetStore(storage), input, invoke)));
  assert.equal(calls, 1);
  assert.equal(results.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.ok(results.filter((entry) => entry.status === "rejected").every((entry) => entry.reason.code === "budget_duplicate_request"));
  await expectCode(invokeWithCumulativeBudget(createCloudflareBudgetStore(storage), { ...input, inputHash: "c".repeat(64) }, invoke), "budget_request_conflict");
  assert.equal(calls, 1);
});

test("existing reservation stays consumed after provider failure and calendar/process changes", async (t) => {
  const storage = await initialized(t);
  const input = request({ upperBoundMicros: 5_000_000 });
  let calls = 0;
  const failure = new Error("synthetic provider failure");
  await assert.rejects(invokeWithCumulativeBudget(createCloudflareBudgetStore(storage), input, () => { calls += 1; throw failure; }), (error) => error === failure);
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2030-01-01T00:00:00Z") });
  await expectCode(invokeWithCumulativeBudget(createCloudflareBudgetStore(storage), request({ upperBoundMicros: 1 }), () => { calls += 1; }), "budget_exhausted");
  assert.equal(calls, 1);
});

test("missing table, missing metadata, altered schema, triggers and corrupt totals fail closed", async (t) => {
  const changes = [
    (storage) => storage.database.exec(`DROP TABLE ${RESERVATIONS}`),
    (storage) => storage.database.exec(`DELETE FROM ${META}`),
    (storage) => storage.database.exec(`ALTER TABLE ${RESERVATIONS} ADD COLUMN extra TEXT`),
    (storage) => storage.database.exec(`CREATE TRIGGER bad_trigger AFTER INSERT ON ${RESERVATIONS} BEGIN UPDATE ${META} SET reserved_micros = 0; END`),
    (storage) => storage.database.exec(`UPDATE ${META} SET reserved_micros = 1`),
  ];
  for (const change of changes) {
    const storage = await initialized(t); change(storage);
    let calls = 0;
    await expectCode(invokeWithCumulativeBudget(createCloudflareBudgetStore(storage), request(), () => { calls += 1; }), "budget_corrupt");
    assert.equal(calls, 0);
  }
});

test("row ordinals, hashes, and request IDs are checked when reading persisted data", async (t) => {
  for (const update of ["ordinal = 2", "subject_hash = 'not-an-opaque-hash'", "request_id = 'not-a-uuid'"]) {
    const storage = await initialized(t);
    await reserveCumulativeBudget(createCloudflareBudgetStore(storage), request());
    storage.database.exec("PRAGMA ignore_check_constraints = ON");
    storage.database.exec(`UPDATE ${RESERVATIONS} SET ${update}`);
    await expectCode(reserveCumulativeBudget(createCloudflareBudgetStore(storage), request()), "budget_corrupt");
  }
});

test("transaction callback cannot refund, alter history, append twice, add private fields, or return a promise", async (t) => {
  const mutations = [
    (ledger) => { ledger.reservations = []; ledger.reservedMicros = 0; },
    (ledger) => { ledger.reservations[0].inputHash = "c".repeat(64); },
    (ledger) => { ledger.reservations.push(request(), request()); ledger.reservedMicros += 2_000_000; },
    (ledger) => { ledger.reservations[0].health = "not allowed"; },
  ];
  for (const mutate of mutations) {
    const storage = await initialized(t);
    await reserveCumulativeBudget(createCloudflareBudgetStore(storage), request());
    const rows = storage.rows();
    await expectCode(createCloudflareBudgetStore(storage).transaction((ledger) => { mutate(ledger); return { ledger, result: "bad" }; }), "budget_corrupt");
    assert.equal(storage.reserved(), 1_000_000);
    assert.deepEqual(storage.rows(), rows);
  }
  const storage = await initialized(t);
  await expectCode(createCloudflareBudgetStore(storage).transaction(async (ledger) => ({ ledger, result: "bad" })), "budget_corrupt");
  assert.equal(storage.reserved(), 0);
});

test("callbacks throwing abort their transaction and legacy KV-only objects are rejected", async (t) => {
  const storage = await initialized(t);
  await expectCode(createCloudflareBudgetStore(storage).transaction(() => { throw new Error("secret error"); }), "budget_unavailable");
  assert.equal(storage.reserved(), 0);
  const legacy = { transaction: async () => {}, get: async () => {}, put: async () => {} };
  await expectCode(reserveCumulativeBudget(createCloudflareBudgetStore(legacy), request()), "budget_unavailable");
  await expectCode(initializeCloudflareBudgetStore(legacy), "budget_unavailable");
});

async function gatedCall(storage, input, provider) {
  assertCloudflareProviderReady(storage);
  return invokeWithCumulativeBudget(createCloudflareBudgetStore(storage), input, async () => {
    const ordinal = await beginCloudflareProviderCall(storage, input);
    const result = await provider();
    await confirmCloudflareProviderCall(storage, ordinal);
    return result;
  });
}
const journalRows = (storage, table) => storage.database.prepare(`SELECT * FROM ${table} ORDER BY reservation_ordinal`).all();

test("append-only attempt is synced before provider and success receipt does not modify reservation history", async (t) => {
  const storage = await initialized(t);
  const input = request();
  let calls = 0;
  const initialSyncs = storage.syncCalls;
  await gatedCall(storage, input, () => {
    calls += 1;
    assert.equal(storage.syncCalls, initialSyncs + 2, "reservation and attempt each acknowledged before spending");
    assert.equal(journalRows(storage, ATTEMPTS).length, 1);
    assert.equal(journalRows(storage, COMPLETIONS).length, 0);
    assert.throws(() => assertCloudflareProviderReady(storage), { code: "provider_verification_pending" });
    return "synthetic fully verified result";
  });
  assert.equal(calls, 1); assert.equal(storage.reserved(), 1_000_000);
  assert.equal(journalRows(storage, COMPLETIONS).length, 1);
  const originalReservation = storage.rows()[0];
  const originalAttempt = journalRows(storage, ATTEMPTS)[0];
  const originalCompletion = journalRows(storage, COMPLETIONS)[0];
  await gatedCall(storage, request(), () => { calls += 1; });
  assert.equal(calls, 2); assert.equal(storage.reserved(), 2_000_000);
  assert.deepEqual(storage.rows()[0], originalReservation);
  assert.deepEqual(journalRows(storage, ATTEMPTS)[0], originalAttempt);
  assert.deepEqual(journalRows(storage, COMPLETIONS)[0], originalCompletion);
  const journalWrites = storage.queries.filter(({ query }) => /^(INSERT|UPDATE|DELETE|REPLACE)/.test(query) && (query.includes(ATTEMPTS) || query.includes(COMPLETIONS)));
  assert.equal(journalWrites.length, 4);
  assert.ok(journalWrites.every(({ query }) => query.startsWith("INSERT INTO")));
});

test("attempt acknowledgement is required; unknown commit remains stopped with reservation retained", async (t) => {
  const storage = await initialized(t);
  const originalSync = storage.sync.bind(storage);
  storage.sync = async () => {
    await originalSync();
    if (journalRows(storage, ATTEMPTS).length) throw new Error("synthetic attempt acknowledgement lost");
  };
  let calls = 0;
  await expectCode(gatedCall(storage, request(), () => { calls += 1; }), "budget_unavailable");
  storage.sync = originalSync;
  assert.equal(calls, 0); assert.equal(storage.reserved(), 1_000_000);
  assert.equal(journalRows(storage, ATTEMPTS).length, 1);
  assert.equal(journalRows(storage, COMPLETIONS).length, 0);
  await expectCode(gatedCall(storage, request(), () => { calls += 1; }), "provider_verification_pending");
  assert.equal(calls, 0); assert.equal(storage.reserved(), 1_000_000);
});

test("crash after the write-ahead attempt blocks new adapters without a refund or automatic completion", async (t) => {
  const storage = await initialized(t);
  const input = request();
  await reserveCumulativeBudget(createCloudflareBudgetStore(storage), input);
  await beginCloudflareProviderCall(storage, input);
  // No completion: simulate process loss without ever executing a provider callback.
  assert.throws(() => assertCloudflareProviderReady(storage), { code: "provider_verification_pending" });
  await expectCode(reserveCumulativeBudget(createCloudflareBudgetStore(storage), request()), "budget_unavailable");
  assert.equal(storage.reserved(), 1_000_000);
  await expectCode(initializeCloudflareBudgetStore(storage), "budget_initialization_not_empty");
  assert.equal(journalRows(storage, COMPLETIONS).length, 0);
});

test("unconfirmed provider outcome leaves pending forever across new request IDs and calendar changes", async (t) => {
  const storage = await initialized(t);
  let calls = 0;
  await assert.rejects(gatedCall(storage, request(), () => { calls += 1; throw new Error("synthetic unconfirmed charge"); }));
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2030-01-01T00:00:00Z") });
  await expectCode(gatedCall(storage, request(), () => { calls += 1; }), "provider_verification_pending");
  assert.equal(calls, 1); assert.equal(storage.reserved(), 1_000_000);
  assert.equal(journalRows(storage, COMPLETIONS).length, 0);
});

test("receipt insert failure rolls back, never unlocks, and retains the prior paid reservation", async (t) => {
  const storage = await initialized(t);
  storage.failQuery = (query) => query.startsWith(`INSERT INTO ${COMPLETIONS}`);
  let calls = 0;
  await expectCode(gatedCall(storage, request(), () => { calls += 1; }), "budget_unavailable");
  storage.failQuery = null;
  await expectCode(gatedCall(storage, request(), () => { calls += 1; }), "provider_verification_pending");
  assert.equal(calls, 1); assert.equal(storage.reserved(), 1_000_000);
  assert.equal(journalRows(storage, COMPLETIONS).length, 0);
});

test("receipt ACK loss may resume only from an actually committed valid receipt; same request stays consumed", async (t) => {
  const storage = await initialized(t);
  const originalSync = storage.sync.bind(storage);
  storage.sync = async () => {
    await originalSync();
    if (journalRows(storage, COMPLETIONS).length) throw new Error("synthetic receipt acknowledgement lost");
  };
  const input = request();
  let calls = 0;
  await expectCode(gatedCall(storage, input, () => { calls += 1; return "confirmed"; }), "budget_unavailable");
  assert.equal(journalRows(storage, COMPLETIONS).length, 1, "receipt really committed despite lost acknowledgement");
  storage.sync = originalSync;
  assert.doesNotThrow(() => assertCloudflareProviderReady(storage));
  await expectCode(gatedCall(storage, input, () => { calls += 1; }), "budget_duplicate_request");
  await gatedCall(storage, request(), () => { calls += 1; });
  assert.equal(calls, 2); assert.equal(storage.reserved(), 2_000_000);
});

test("receipt not committed after success remains stopped rather than guessing the missing acknowledgement", async (t) => {
  const storage = await initialized(t);
  const input = request();
  await reserveCumulativeBudget(createCloudflareBudgetStore(storage), input);
  await beginCloudflareProviderCall(storage, input);
  // Simulate success received but a process crash before the receipt append.
  await expectCode(gatedCall(storage, request(), () => assert.fail("must stay stopped")), "provider_verification_pending");
  assert.equal(storage.reserved(), 1_000_000);
});

test("missing/altered journals, forged orphan receipts and contradictory ordinals fail closed", async (t) => {
  for (const mutate of [
    (s) => s.database.exec(`DROP TABLE ${ATTEMPTS}`),
    (s) => s.database.exec(`DROP TABLE ${COMPLETIONS}`),
    (s) => s.database.exec(`ALTER TABLE ${COMPLETIONS} ADD COLUMN extra TEXT`),
    (s) => s.database.exec(`INSERT INTO ${COMPLETIONS} VALUES (1, 'verified-model-tier-usage-v1')`),
    (s) => s.database.exec(`INSERT INTO ${ATTEMPTS} VALUES (2, '1')`),
    (s) => s.database.exec(`CREATE TRIGGER forged_completion AFTER INSERT ON ${ATTEMPTS} BEGIN INSERT INTO ${COMPLETIONS} VALUES (NEW.reservation_ordinal, 'verified-model-tier-usage-v1'); END`),
  ]) {
    const storage = await initialized(t);
    await reserveCumulativeBudget(createCloudflareBudgetStore(storage), request());
    mutate(storage);
    assert.throws(() => assertCloudflareProviderReady(storage), { code: "budget_corrupt" });
    await expectCode(gatedCall(storage, request(), () => assert.fail("must stay stopped")), "budget_corrupt");
    assert.equal(storage.reserved(), 1_000_000);
  }
});

test("unbound and already-completed attempts cannot be invoked again or unlocked twice", async (t) => {
  const storage = await initialized(t);
  const input = request();
  await reserveCumulativeBudget(createCloudflareBudgetStore(storage), input);
  await expectCode(beginCloudflareProviderCall(storage, { ...input, requestId: randomUUID() }), "budget_corrupt");
  const ordinal = await beginCloudflareProviderCall(storage, input);
  await expectCode(confirmCloudflareProviderCall(storage, ordinal + 1), "budget_corrupt");
  await confirmCloudflareProviderCall(storage, ordinal);
  await expectCode(beginCloudflareProviderCall(storage, input), "budget_corrupt");
  await expectCode(confirmCloudflareProviderCall(storage, ordinal), "budget_corrupt");
  assert.equal(journalRows(storage, ATTEMPTS).length, 1);
  assert.equal(journalRows(storage, COMPLETIONS).length, 1);
});
