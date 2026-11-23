import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { CUMULATIVE_BUDGET_LIMIT_MICROS, MAX_CUMULATIVE_BUDGET_RESERVATIONS, invokeWithCumulativeBudget, reserveCumulativeBudget } from "./cumulative-budget.ts";

// Explicit test-fixture initialization only: production reserve never initializes storage.
const initialLedger = () => ({ version: "1", limitMicros: 5_000_000, reservedMicros: 0, reservations: [] });
const request = (overrides = {}) => ({ requestId: randomUUID(), subjectHash: "a".repeat(64), inputHash: "b".repeat(64), upperBoundMicros: 1_000_000, ...overrides });
const expectCode = (promise, code) => assert.rejects(promise, { name: "CumulativeBudgetError", code, message: code });

/** One RAM backing store shared by fake process adapters, with atomic durable-commit semantics. */
class FakeDatabase {
  constructor(value = initialLedger()) {
    this.value = structuredClone(value);
    this.tail = Promise.resolve();
    this.fail = null;
    this.commits = 0;
  }
  connection() {
    return { transaction: (operation) => {
      const attempt = this.tail.then(async () => {
        if (this.fail === "read") throw new Error("synthetic secret must never escape");
        const transaction = operation(structuredClone(this.value));
        await Promise.resolve(); // Force overlap; only the transaction queue provides isolation.
        if (this.fail === "commit") throw new Error("synthetic commit failure");
        this.value = structuredClone(transaction.ledger);
        this.commits += 1;
        if (this.fail === "ack") throw new Error("commit succeeded but acknowledgement lost");
        return transaction.result;
      });
      this.tail = attempt.catch(() => {});
      return attempt;
    } };
  }
}

test("reserves integer microUSD before granting exactly one provider call", async () => {
  const database = new FakeDatabase();
  const decision = await reserveCumulativeBudget(database.connection(), request());
  assert.deepEqual(decision, { status: "reserved", canCallProvider: true, upperBoundMicros: 1_000_000, totalReservedMicros: 1_000_000, remainingMicros: 4_000_000 });
  assert.equal(database.commits, 1);
  assert.equal(database.value.reservedMicros, 1_000_000);
});

test("all subjects and concurrent process adapters share a single cumulative ceiling", async () => {
  const database = new FakeDatabase();
  const attempts = await Promise.allSettled(Array.from({ length: 40 }, (_, index) => reserveCumulativeBudget(database.connection(), request({ subjectHash: index.toString(16).padStart(64, "0"), upperBoundMicros: 250_000 }))));
  const granted = attempts.filter((entry) => entry.status === "fulfilled");
  assert.equal(granted.length, 20);
  assert.ok(granted.every((entry) => entry.value.canCallProvider));
  assert.ok(attempts.filter((entry) => entry.status === "rejected").every((entry) => entry.reason.code === "budget_exhausted"));
  assert.equal(database.value.reservedMicros, CUMULATIVE_BUDGET_LIMIT_MICROS);
  assert.equal(database.value.reservations.length, 20);
});

test("concurrent duplicates grant one call, retaining idempotency after a new process adapter", async () => {
  const database = new FakeDatabase();
  const input = request();
  const decisions = await Promise.all(Array.from({ length: 20 }, () => reserveCumulativeBudget(database.connection(), input)));
  assert.equal(decisions.filter((entry) => entry.canCallProvider).length, 1);
  assert.equal(database.value.reservedMicros, 1_000_000);
  const restarted = await reserveCumulativeBudget(database.connection(), input);
  assert.equal(restarted.status, "duplicate");
  assert.equal(restarted.canCallProvider, false);
});

test("duplicates never grant another call even if the newly supplied price upper bound changes", async () => {
  const database = new FakeDatabase();
  const input = request();
  await reserveCumulativeBudget(database.connection(), input);
  for (const upperBoundMicros of [1, 2_000_000]) {
    const repeated = await reserveCumulativeBudget(database.connection(), { ...input, upperBoundMicros });
    assert.equal(repeated.canCallProvider, false);
    assert.equal(repeated.upperBoundMicros, 1_000_000);
  }
  assert.equal(database.value.reservedMicros, 1_000_000);
});

test("same subject and UUID with changed input conflicts without overwriting the original reservation", async () => {
  const database = new FakeDatabase();
  const input = request();
  await reserveCumulativeBudget(database.connection(), input);
  await expectCode(reserveCumulativeBudget(database.connection(), { ...input, inputHash: "c".repeat(64) }), "budget_request_conflict");
  assert.equal(database.value.reservations[0].inputHash, input.inputHash);
  assert.equal(database.value.reservedMicros, 1_000_000);
});

test("different subjects sharing a UUID remain independent but consume the same global ceiling", async () => {
  const database = new FakeDatabase();
  const input = request();
  await reserveCumulativeBudget(database.connection(), input);
  const other = await reserveCumulativeBudget(database.connection(), { ...input, subjectHash: "c".repeat(64), inputHash: "d".repeat(64) });
  assert.equal(other.canCallProvider, true);
  assert.equal(other.totalReservedMicros, 2_000_000);
});

test("restart and month/year changes do not replenish the cumulative budget", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-30T23:59:00Z") });
  const database = new FakeDatabase();
  await reserveCumulativeBudget(database.connection(), request({ upperBoundMicros: 5_000_000 }));
  for (const date of ["2026-12-01T00:01:00Z", "2027-01-01T00:00:00Z", "2030-01-01T00:00:00Z"]) {
    t.mock.timers.setTime(new Date(date).getTime());
    await expectCode(reserveCumulativeBudget(database.connection(), request({ upperBoundMicros: 1 })), "budget_exhausted");
  }
  assert.equal(database.value.reservedMicros, 5_000_000);
});

test("exact final microUSD is permitted and the next microUSD is denied", async () => {
  const database = new FakeDatabase();
  await reserveCumulativeBudget(database.connection(), request({ upperBoundMicros: 4_999_999 }));
  assert.equal((await reserveCumulativeBudget(database.connection(), request({ upperBoundMicros: 1 }))).remainingMicros, 0);
  await expectCode(reserveCumulativeBudget(database.connection(), request({ upperBoundMicros: 1 })), "budget_exhausted");
});

test("a committed reservation survives success, provider failure, timeout, refusal, and lost caller process", async () => {
  for (const outcome of ["success", "failure", "timeout", "refusal", "process crash"]) {
    const database = new FakeDatabase();
    const input = request({ upperBoundMicros: 5_000_000 });
    assert.equal((await reserveCumulativeBudget(database.connection(), input)).canCallProvider, true, outcome);
    // No finalize/refund operation: downstream outcome cannot change or free the reservation.
    assert.equal((await reserveCumulativeBudget(database.connection(), input)).canCallProvider, false, outcome);
    await expectCode(reserveCumulativeBudget(database.connection(), request({ upperBoundMicros: 1 })), "budget_exhausted");
  }
});

test("missing storage never initializes a new zero budget", async () => {
  for (const value of [null, undefined]) {
    const database = new FakeDatabase(null); database.value = value;
    await expectCode(reserveCumulativeBudget(database.connection(), request()), "budget_uninitialized");
    assert.equal(database.value, value);
    assert.equal(database.commits, 0);
  }
});

test("read or commit failures grant no call and do not leak store error details", async () => {
  for (const failure of ["read", "commit"]) {
    const database = new FakeDatabase(); database.fail = failure;
    await expectCode(reserveCumulativeBudget(database.connection(), request()), "budget_unavailable");
    assert.equal(database.value.reservedMicros, 0);
    assert.equal(database.commits, 0);
  }
});

test("lost commit acknowledgement never grants a retry or resets a committed reservation", async () => {
  const database = new FakeDatabase(); database.fail = "ack";
  const input = request();
  await expectCode(reserveCumulativeBudget(database.connection(), input), "budget_unavailable");
  assert.equal(database.value.reservedMicros, 1_000_000);
  database.fail = null;
  assert.equal((await reserveCumulativeBudget(database.connection(), input)).canCallProvider, false);
  assert.equal(database.value.reservedMicros, 1_000_000);
});

test("invalid reservation amounts, nonopaque identity, unknown fields, and noncanonical IDs fail before storage", async () => {
  const invalid = [
    ...[0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER, 5_000_001, "100"].map((upperBoundMicros) => request({ upperBoundMicros })),
    request({ subjectHash: "person@example.invalid" }), request({ inputHash: "health details" }),
    request({ subjectHash: "A".repeat(64) }), request({ requestId: "not-a-uuid" }),
    request({ requestId: randomUUID().toUpperCase() }), request({ calories: 400 }),
    null, [], Object.create(request()),
  ];
  for (const input of invalid) {
    const database = new FakeDatabase();
    await expectCode(reserveCumulativeBudget(database.connection(), input), "budget_invalid_request");
    assert.equal(database.commits, 0);
  }
});

test("malformed or inconsistent persisted ledgers fail closed instead of repairing or resetting", async () => {
  const existing = request({ upperBoundMicros: 100 });
  const mutations = [
    (value) => { value.version = "2"; },
    (value) => { value.limitMicros = 10_000_000; },
    (value) => { value.reservedMicros = -1; },
    (value) => { value.reservedMicros = 0.5; },
    (value) => { value.reservedMicros = 99; },
    (value) => { value.reservedMicros = 5_000_001; },
    (value) => { value.reservations = {}; },
    (value) => { value.reservations = [existing, existing]; value.reservedMicros = 200; },
    (value) => { value.reservations[0].upperBoundMicros = 0; },
    (value) => { value.reservations[0].requestId = "bad"; },
    (value) => { value.reservations[0].subjectHash = "raw-uid"; },
    (value) => { value.reservations[0].response = { mealIds: [] }; },
    (value) => { value.month = "2026-11"; },
    (value) => { value.healthRecords = []; },
    (value) => { delete value.reservedMicros; },
    (value) => { delete value.reservations[0]; },
  ];
  for (const mutate of mutations) {
    const value = { ...initialLedger(), reservedMicros: 100, reservations: [structuredClone(existing)] };
    mutate(value);
    const database = new FakeDatabase(value);
    await expectCode(reserveCumulativeBudget(database.connection(), request()), "budget_corrupt");
    assert.equal(database.commits, 0);
    assert.deepEqual(database.value, value);
  }
});

test("accessors, prototypes, sparse arrays and hidden unknown fields are rejected without evaluation", async () => {
  const input = request();
  Object.defineProperty(input, "inputHash", { get() { throw new Error("must not run"); } });
  await expectCode(reserveCumulativeBudget(new FakeDatabase().connection(), input), "budget_invalid_request");
  const symbol = request(); symbol[Symbol("extra")] = "private";
  await expectCode(reserveCumulativeBudget(new FakeDatabase().connection(), symbol), "budget_invalid_request");
  const values = [Object.create(initialLedger()), initialLedger(), initialLedger(), initialLedger()];
  Object.defineProperty(values[1], "reservedMicros", { get() { throw new Error("must not run"); } });
  Object.defineProperty(values[2], "private", { value: "not permitted", enumerable: false });
  values[3].reservations[Symbol("extra")] = "private";
  for (const value of values) {
    const store = { transaction: async (operation) => operation(value).result };
    await expectCode(reserveCumulativeBudget(store, request()), "budget_corrupt");
  }
});

test("storage capacity cap retains all deduplication history and stops new calls", async () => {
  const reservations = Array.from({ length: MAX_CUMULATIVE_BUDGET_RESERVATIONS }, () => request({ upperBoundMicros: 1 }));
  const database = new FakeDatabase({ ...initialLedger(), reservedMicros: reservations.length, reservations });
  await expectCode(reserveCumulativeBudget(database.connection(), request({ upperBoundMicros: 1 })), "budget_capacity_reached");
  assert.equal((await reserveCumulativeBudget(database.connection(), reservations[0])).canCallProvider, false);
  assert.equal(database.value.reservations.length, MAX_CUMULATIVE_BUDGET_RESERVATIONS);
});

test("overlong persisted arrays and overlong fields fail closed with bounded schema", async () => {
  const reservations = Array.from({ length: MAX_CUMULATIVE_BUDGET_RESERVATIONS + 1 }, () => request({ upperBoundMicros: 1 }));
  const database = new FakeDatabase({ ...initialLedger(), reservedMicros: reservations.length, reservations });
  await expectCode(reserveCumulativeBudget(database.connection(), request()), "budget_corrupt");
  assert.equal(database.commits, 0);
  for (const field of ["subjectHash", "inputHash", "requestId"]) {
    await expectCode(reserveCumulativeBudget(new FakeDatabase().connection(), request({ [field]: "a".repeat(100_000) })), "budget_invalid_request");
  }
});

test("a transaction adapter may retry the pure callback without multiplying reservations", async () => {
  let value = initialLedger();
  const store = { transaction: async (operation) => {
    operation(structuredClone(value)); // Aborted transaction attempt, result discarded.
    const committed = operation(structuredClone(value));
    value = structuredClone(committed.ledger);
    return committed.result;
  } };
  assert.equal((await reserveCumulativeBudget(store, request())).canCallProvider, true);
  assert.equal(value.reservedMicros, 1_000_000);
  assert.equal(value.reservations.length, 1);
});

test("the stored schema contains costs and opaque identifiers only, never provider output or health data", async () => {
  const database = new FakeDatabase();
  await reserveCumulativeBudget(database.connection(), request());
  assert.deepEqual(Object.keys(database.value).sort(), ["limitMicros", "reservations", "reservedMicros", "version"]);
  assert.deepEqual(Object.keys(database.value.reservations[0]).sort(), ["inputHash", "requestId", "subjectHash", "upperBoundMicros"]);
});

test("guard invokes once only after confirmed durable commit and never persists the provider result", async () => {
  const database = new FakeDatabase();
  let calls = 0;
  const syntheticOutput = { mealIds: ["synthetic-meal-id"], workoutIds: [] };
  const result = await invokeWithCumulativeBudget(database.connection(), request(), async () => {
    assert.equal(database.commits, 1);
    assert.equal(database.value.reservedMicros, 1_000_000);
    calls += 1;
    return syntheticOutput;
  });
  assert.equal(calls, 1);
  assert.equal(result, syntheticOutput);
  assert.ok(!JSON.stringify(database.value).includes("synthetic-meal-id"));
});

test("guard never invokes while durable commit is still pending", async () => {
  let finishCommit;
  let prepared;
  const preparedPromise = new Promise((resolve) => { prepared = resolve; });
  const commitPromise = new Promise((resolve) => { finishCommit = resolve; });
  let calls = 0;
  const store = { transaction: async (operation) => {
    const next = operation(initialLedger());
    prepared();
    await commitPromise;
    return next.result;
  } };
  const pending = invokeWithCumulativeBudget(store, request(), () => { calls += 1; return "synthetic-result"; });
  await preparedPromise;
  assert.equal(calls, 0);
  finishCommit();
  assert.equal(await pending, "synthetic-result");
  assert.equal(calls, 1);
});

test("guard blocks free-tier store failures, read/commit/ack failures, missing/corrupt ledgers and insufficient funds before provider invocation", async () => {
  const databaseCases = [
    { state: null, code: "budget_uninitialized" },
    { state: undefined, code: "budget_uninitialized" },
    { state: { ...initialLedger(), reservedMicros: 1 }, code: "budget_corrupt" },
    { state: { ...initialLedger(), reservedMicros: 5_000_000, reservations: [request({ upperBoundMicros: 5_000_000 })] }, code: "budget_exhausted" },
    ...["read", "commit", "ack"].map((failure) => ({ state: initialLedger(), failure, code: "budget_unavailable" })),
  ];
  for (const fixture of databaseCases) {
    const database = new FakeDatabase(null);
    database.value = fixture.state;
    database.fail = fixture.failure ?? null;
    let calls = 0;
    await expectCode(invokeWithCumulativeBudget(database.connection(), request(), () => { calls += 1; }), fixture.code);
    assert.equal(calls, 0, fixture.code);
  }
  const quotaStore = { transaction: async () => { throw new Error("synthetic free-tier quota exhausted"); } };
  let calls = 0;
  await expectCode(invokeWithCumulativeBudget(quotaStore, request(), () => { calls += 1; }), "budget_unavailable");
  assert.equal(calls, 0);
});

test("guard rejects duplicates with a fixed code and concurrent duplicates invoke exactly once", async () => {
  const database = new FakeDatabase();
  const input = request();
  let calls = 0;
  const invoke = async () => { calls += 1; await Promise.resolve(); return "synthetic-result"; };
  const results = await Promise.allSettled(Array.from({ length: 30 }, () => invokeWithCumulativeBudget(database.connection(), input, invoke)));
  assert.equal(calls, 1);
  assert.equal(results.filter((entry) => entry.status === "fulfilled").length, 1);
  const rejected = results.filter((entry) => entry.status === "rejected");
  assert.equal(rejected.length, 29);
  assert.ok(rejected.every((entry) => entry.reason.code === "budget_duplicate_request"));
  await expectCode(invokeWithCumulativeBudget(database.connection(), input, invoke), "budget_duplicate_request");
  assert.equal(calls, 1);
  assert.equal(database.value.reservedMicros, 1_000_000);
});

test("guard retains reservation after provider synchronous throw or rejection, with no automatic or duplicate retry", async () => {
  for (const mode of ["synchronous", "rejection"]) {
    const database = new FakeDatabase();
    const input = request();
    const syntheticFailure = new Error("synthetic provider failure");
    let calls = 0;
    const invoke = () => {
      calls += 1;
      if (mode === "synchronous") throw syntheticFailure;
      return Promise.reject(syntheticFailure);
    };
    await assert.rejects(invokeWithCumulativeBudget(database.connection(), input, invoke), (error) => error === syntheticFailure);
    assert.equal(calls, 1);
    assert.equal(database.value.reservedMicros, 1_000_000);
    await expectCode(invokeWithCumulativeBudget(database.connection(), input, invoke), "budget_duplicate_request");
    assert.equal(calls, 1);
    assert.equal(database.value.reservedMicros, 1_000_000);
  }
});

test("guard never retries an ambiguous committed reservation after the store acknowledgement was lost", async () => {
  const database = new FakeDatabase(); database.fail = "ack";
  const input = request();
  let calls = 0;
  const invoke = () => { calls += 1; return "synthetic-result"; };
  await expectCode(invokeWithCumulativeBudget(database.connection(), input, invoke), "budget_unavailable");
  database.fail = null;
  await expectCode(invokeWithCumulativeBudget(database.connection(), input, invoke), "budget_duplicate_request");
  assert.equal(calls, 0);
  assert.equal(database.value.reservedMicros, 1_000_000);
});

test("guard runs paid work outside retried transaction callbacks", async () => {
  let calls = 0;
  const store = { transaction: async (operation) => {
    operation(initialLedger());
    operation(initialLedger());
    assert.equal(calls, 0);
    const committed = operation(initialLedger());
    return committed.result;
  } };
  await invokeWithCumulativeBudget(store, request(), () => { calls += 1; });
  assert.equal(calls, 1);
});
