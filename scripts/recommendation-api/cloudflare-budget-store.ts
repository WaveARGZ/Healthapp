import { CUMULATIVE_BUDGET_LIMIT_MICROS, MAX_CUMULATIVE_BUDGET_RESERVATIONS, CumulativeBudgetError } from "./cumulative-budget.ts";
import type { AtomicBudgetStore, BudgetReservation, BudgetTransaction, CumulativeBudgetLedger } from "./cumulative-budget.ts";

/** Structural subset of the SQLite-backed Durable Object storage API; no SDK dependency. */
export interface CloudflareSqliteStorage {
  sql: { exec(query: string, ...bindings: (string | number)[]): { toArray(): unknown[] } };
  transactionSync<T>(callback: () => T): T;
  sync(): Promise<void>;
}

export class BudgetInitializationError extends Error {
  readonly code = "budget_initialization_not_empty";
  constructor() { super("budget_initialization_not_empty"); this.name = "BudgetInitializationError"; }
}

/** A previous paid attempt has no durable, validated success receipt. No automatic reset exists. */
export class BudgetProviderGateError extends Error {
  readonly code = "provider_verification_pending";
  constructor() { super("provider_verification_pending"); this.name = "BudgetProviderGateError"; }
}

const META = "bodymake_recommendation_budget_meta";
const RESERVATIONS = "bodymake_recommendation_budget_reservations";
const ATTEMPTS = "bodymake_recommendation_provider_attempts";
const COMPLETIONS = "bodymake_recommendation_provider_completions";
const META_DDL = `CREATE TABLE ${META} (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version TEXT NOT NULL CHECK (version = '1'),
  limit_micros INTEGER NOT NULL CHECK (limit_micros = 5000000),
  reserved_micros INTEGER NOT NULL CHECK (typeof(reserved_micros) = 'integer' AND reserved_micros BETWEEN 0 AND 5000000)
)`;
const RESERVATIONS_DDL = `CREATE TABLE ${RESERVATIONS} (
  ordinal INTEGER PRIMARY KEY CHECK (ordinal BETWEEN 1 AND 10000),
  request_id TEXT NOT NULL CHECK (length(CAST(request_id AS BLOB)) = 36),
  subject_hash TEXT NOT NULL CHECK (length(CAST(subject_hash AS BLOB)) = 64),
  input_hash TEXT NOT NULL CHECK (length(CAST(input_hash AS BLOB)) = 64),
  upper_bound_micros INTEGER NOT NULL CHECK (typeof(upper_bound_micros) = 'integer' AND upper_bound_micros BETWEEN 1 AND 5000000),
  UNIQUE (subject_hash, request_id)
)`;
// Both journals are append-only. An attempt without its matching completion is the durable stop gate.
// Ordinals reference the immutable budget reservation, without copying user/input/provider data.
const ATTEMPTS_DDL = `CREATE TABLE ${ATTEMPTS} (
  reservation_ordinal INTEGER PRIMARY KEY CHECK (reservation_ordinal BETWEEN 1 AND 10000),
  version TEXT NOT NULL CHECK (version = '1')
)`;
const COMPLETIONS_DDL = `CREATE TABLE ${COMPLETIONS} (
  reservation_ordinal INTEGER PRIMARY KEY CHECK (reservation_ordinal BETWEEN 1 AND 10000),
  confirmation TEXT NOT NULL CHECK (confirmation = 'verified-model-tier-usage-v1')
)`;

function corrupt(): never { throw new CumulativeBudgetError("budget_corrupt"); }
function unavailable(error: unknown): never {
  if (error instanceof CumulativeBudgetError || error instanceof BudgetInitializationError || error instanceof BudgetProviderGateError) throw error;
  // SQL/store error text may contain private values; never log or expose it.
  throw new CumulativeBudgetError("budget_unavailable");
}

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const found = Reflect.ownKeys(value);
  return found.length === keys.length && found.every((key) => typeof key === "string" && keys.includes(key) && "value" in Object.getOwnPropertyDescriptor(value, key)!);
}
function micros(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= CUMULATIVE_BUDGET_LIMIT_MICROS;
}
function hash(value: unknown): value is string { return typeof value === "string" && value.length === 64 && /^[a-f0-9]{64}$/.test(value); }
function uuid(value: unknown): value is string { return typeof value === "string" && value.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value); }
function canonicalSql(sql: string): string { return sql.replace(/\s+/g, " ").trim(); }

/** Independently validate callback output before any append; never trust its TypeScript type alone. */
function checkedLedger(value: unknown): CumulativeBudgetLedger {
  if (!exact(value, ["version", "limitMicros", "reservedMicros", "reservations"])
    || value.version !== "1" || value.limitMicros !== CUMULATIVE_BUDGET_LIMIT_MICROS
    || !micros(value.reservedMicros, 0) || !Array.isArray(value.reservations)
    || value.reservations.length > MAX_CUMULATIVE_BUDGET_RESERVATIONS
    || Reflect.ownKeys(value.reservations).length !== value.reservations.length + 1) corrupt();
  const entries: BudgetReservation[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (let index = 0; index < value.reservations.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value.reservations, String(index));
    if (!descriptor || !("value" in descriptor)) corrupt();
    const entry = descriptor.value;
    if (!exact(entry, ["requestId", "subjectHash", "inputHash", "upperBoundMicros"])
      || !uuid(entry.requestId) || !hash(entry.subjectHash) || !hash(entry.inputHash) || !micros(entry.upperBoundMicros, 1)) corrupt();
    const key = `${entry.subjectHash}:${entry.requestId}`;
    if (seen.has(key)) corrupt();
    seen.add(key);
    total += entry.upperBoundMicros;
    if (!micros(total, 0)) corrupt();
    entries.push({ requestId: entry.requestId, subjectHash: entry.subjectHash, inputHash: entry.inputHash, upperBoundMicros: entry.upperBoundMicros });
  }
  if (total !== value.reservedMicros) corrupt();
  return { version: "1", limitMicros: CUMULATIVE_BUDGET_LIMIT_MICROS, reservedMicros: total, reservations: entries };
}

/** Reject missing/modified schema and triggers instead of silently migrating or repairing it. */
function checkSchema(storage: CloudflareSqliteStorage): void {
  const schema = storage.sql.exec(
    "SELECT name, type, sql FROM sqlite_master WHERE name IN (?, ?, ?, ?) OR (type = 'trigger' AND tbl_name IN (?, ?, ?, ?)) ORDER BY name LIMIT 6",
    META, RESERVATIONS, ATTEMPTS, COMPLETIONS, META, RESERVATIONS, ATTEMPTS, COMPLETIONS,
  ).toArray();
  if (schema.length === 0) throw new CumulativeBudgetError("budget_uninitialized");
  if (schema.length !== 4) corrupt();
  const expected = new Map([[META, META_DDL], [RESERVATIONS, RESERVATIONS_DDL], [ATTEMPTS, ATTEMPTS_DDL], [COMPLETIONS, COMPLETIONS_DDL]]);
  for (const entry of schema) {
    if (!exact(entry, ["name", "type", "sql"]) || typeof entry.name !== "string" || entry.type !== "table" || typeof entry.sql !== "string") corrupt();
    const definition = expected.get(entry.name);
    if (!definition || canonicalSql(entry.sql) !== canonicalSql(definition)) corrupt();
    expected.delete(entry.name);
  }
  if (expected.size) corrupt();
}

function readLedger(storage: CloudflareSqliteStorage): CumulativeBudgetLedger {
  checkSchema(storage);
  const metadata = storage.sql.exec(`SELECT singleton, version, limit_micros, reserved_micros FROM ${META} LIMIT 2`).toArray();
  if (metadata.length !== 1) corrupt();
  const meta = metadata[0];
  if (!exact(meta, ["singleton", "version", "limit_micros", "reserved_micros"]) || meta.singleton !== 1) corrupt();
  // Fully consume every SQL cursor before any await. LIMIT also bounds malformed oversized stores.
  const rows = storage.sql.exec(`SELECT ordinal, request_id, subject_hash, input_hash, upper_bound_micros FROM ${RESERVATIONS} ORDER BY ordinal LIMIT ?`, MAX_CUMULATIVE_BUDGET_RESERVATIONS + 1).toArray();
  if (rows.length > MAX_CUMULATIVE_BUDGET_RESERVATIONS) corrupt();
  const reservations = rows.map((entry, index) => {
    if (!exact(entry, ["ordinal", "request_id", "subject_hash", "input_hash", "upper_bound_micros"]) || entry.ordinal !== index + 1) corrupt();
    return { requestId: entry.request_id, subjectHash: entry.subject_hash, inputHash: entry.input_hash, upperBoundMicros: entry.upper_bound_micros };
  });
  return checkedLedger({ version: meta.version, limitMicros: meta.limit_micros, reservedMicros: meta.reserved_micros, reservations });
}

function sameReservation(left: BudgetReservation, right: BudgetReservation): boolean {
  return left.requestId === right.requestId && left.subjectHash === right.subjectHash && left.inputHash === right.inputHash && left.upperBoundMicros === right.upperBoundMicros;
}

/** Revalidate all receipts synchronously against the current immutable reservation history. */
function providerJournal(storage: CloudflareSqliteStorage, ledger: CumulativeBudgetLedger): { attempted: Set<number>; pending: number | null } {
  const attempts = storage.sql.exec(`SELECT reservation_ordinal, version FROM ${ATTEMPTS} ORDER BY reservation_ordinal LIMIT ?`, MAX_CUMULATIVE_BUDGET_RESERVATIONS + 1).toArray();
  const completions = storage.sql.exec(`SELECT reservation_ordinal, confirmation FROM ${COMPLETIONS} ORDER BY reservation_ordinal LIMIT ?`, MAX_CUMULATIVE_BUDGET_RESERVATIONS + 1).toArray();
  if (attempts.length > ledger.reservations.length || completions.length > attempts.length || attempts.length - completions.length > 1) corrupt();
  const attempted = new Set<number>();
  let previous = 0;
  for (const row of attempts) {
    if (!exact(row, ["reservation_ordinal", "version"]) || typeof row.reservation_ordinal !== "number"
      || !Number.isSafeInteger(row.reservation_ordinal) || row.reservation_ordinal <= previous
      || row.reservation_ordinal > ledger.reservations.length || row.version !== "1") corrupt();
    attempted.add(row.reservation_ordinal);
    previous = row.reservation_ordinal;
  }
  let completedPrevious = 0;
  const completed = new Set<number>();
  for (const row of completions) {
    if (!exact(row, ["reservation_ordinal", "confirmation"]) || typeof row.reservation_ordinal !== "number"
      || !attempted.has(row.reservation_ordinal) || row.reservation_ordinal <= completedPrevious
      || row.confirmation !== "verified-model-tier-usage-v1") corrupt();
    completed.add(row.reservation_ordinal);
    completedPrevious = row.reservation_ordinal;
  }
  const pending = [...attempted].find((ordinal) => !completed.has(ordinal)) ?? null;
  // No later attempt may exist while an earlier one is unresolved.
  if (pending !== null && pending !== previous) corrupt();
  return { attempted, pending };
}

/** Read-only gate before authentication/paid work; missing or corrupt journals are never repaired. */
export function assertCloudflareProviderReady(storage: CloudflareSqliteStorage): void {
  try {
    storage.transactionSync(() => {
      if (providerJournal(storage, readLedger(storage)).pending !== null) throw new BudgetProviderGateError();
    });
  } catch (error) { return unavailable(error); }
}

/**
 * Persist the stop gate AFTER the budget reservation and BEFORE any provider request.
 * A crash or unknown sync outcome leaves the attempt without a completion, blocking later work.
 */
export async function beginCloudflareProviderCall(storage: CloudflareSqliteStorage, reservation: BudgetReservation): Promise<number> {
  try {
    const ordinal = storage.transactionSync(() => {
      const ledger = readLedger(storage);
      const journal = providerJournal(storage, ledger);
      if (journal.pending !== null) throw new BudgetProviderGateError();
      const index = ledger.reservations.findIndex((entry) => sameReservation(entry, reservation));
      if (index < 0 || index !== ledger.reservations.length - 1 || journal.attempted.has(index + 1)) corrupt();
      storage.sql.exec(`INSERT INTO ${ATTEMPTS} (reservation_ordinal, version) VALUES (?, '1')`, index + 1).toArray();
      return index + 1;
    });
    await storage.sync();
    return ordinal;
  } catch (error) { return unavailable(error); }
}

/**
 * Call ONLY after the production provider validated its exact model/tier/token usage and ranking.
 * No receipt is written on refusal, timeout, error, or otherwise unconfirmed result. Reservations
 * and attempts are never deleted/updated/refunded. There is intentionally no admin unlock endpoint.
 *
 * ACK loss distinction: if receipt sync fails, this request fails. A subsequent process may resume
 * ONLY if the actual committed receipt passes a fresh synchronous journal/ledger integrity check.
 * Such a receipt attests to a confirmed result; absence or inconsistency remains stopped. Never
 * claim every failed ACK leaves pending, and never rewrite journals to guess whether commit won.
 */
export async function confirmCloudflareProviderCall(storage: CloudflareSqliteStorage, ordinal: number): Promise<void> {
  try {
    storage.transactionSync(() => {
      const ledger = readLedger(storage);
      const journal = providerJournal(storage, ledger);
      if (!Number.isSafeInteger(ordinal) || ordinal < 1 || journal.pending !== ordinal) corrupt();
      storage.sql.exec(`INSERT INTO ${COMPLETIONS} (reservation_ordinal, confirmation) VALUES (?, 'verified-model-tier-usage-v1')`, ordinal).toArray();
    });
    await storage.sync();
  } catch (error) { return unavailable(error); }
}

/**
 * SQLite-only Durable Object adapter. All users MUST route to one fixed global DO
 * identity; never partition this ledger per UID, request, deployment, or month.
 * The caller must retain that namespace/identity and must not delete, restore to an
 * older PITR snapshot, or replace the ledger. No migration/reset/TTL/KV API is used.
 *
 * Cloudflare transactionSync rolls back on a synchronous callback exception.
 * sync() is separately awaited after it, before releasing any paid-call permission.
 * See https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
 * (#transactionsync, #sync, and the synchronous SQL cursor guidance).
 *
 * This adapter does not verify the account's Free plan or price upper bounds.
 * Free-tier quota/storage failures fail closed; a paid-plan billing switch must be
 * prevented/verified outside this module. No actual Cloudflare connection is made here.
 */
export function createCloudflareBudgetStore(storage: CloudflareSqliteStorage): AtomicBudgetStore {
  return {
    async transaction<T>(operation: (current: unknown) => BudgetTransaction<T>): Promise<T> {
      try {
        if (!storage || typeof storage.transactionSync !== "function" || typeof storage.sync !== "function" || typeof storage.sql?.exec !== "function") throw new CumulativeBudgetError("budget_unavailable");
        const committed = storage.transactionSync(() => {
          const before = readLedger(storage);
          const journal = providerJournal(storage, before);
          // Preserve a separate baseline even if a malformed callback mutates its input.
          const proposal = operation(structuredClone(before));
          if (!exact(proposal, ["ledger", "result"])) corrupt();
          const after = checkedLedger(proposal.ledger);
          if (after.reservations.length < before.reservations.length || after.reservations.length > before.reservations.length + 1) corrupt();
          for (let index = 0; index < before.reservations.length; index += 1) {
            if (!sameReservation(before.reservations[index], after.reservations[index])) corrupt();
          }
          if (after.reservations.length === before.reservations.length + 1) {
            if (journal.pending !== null) throw new BudgetProviderGateError();
            const added = after.reservations[before.reservations.length];
            storage.sql.exec(`INSERT INTO ${RESERVATIONS} (ordinal, request_id, subject_hash, input_hash, upper_bound_micros) VALUES (?, ?, ?, ?, ?)`, after.reservations.length, added.requestId, added.subjectHash, added.inputHash, added.upperBoundMicros).toArray();
            const updated = storage.sql.exec(`UPDATE ${META} SET reserved_micros = ? WHERE singleton = 1 AND reserved_micros = ? RETURNING reserved_micros`, after.reservedMicros, before.reservedMicros).toArray();
            if (updated.length !== 1 || !exact(updated[0], ["reserved_micros"]) || updated[0].reserved_micros !== after.reservedMicros) corrupt();
          }
          // Duplicate decisions perform no writes. Existing reservation rows are never rewritten.
          // Always return a synchronous wrapper, even if a generic caller's T is thenable.
          return { result: proposal.result as T };
        });
        await storage.sync();
        return committed.result;
      } catch (error) { return unavailable(error); }
    },
  };
}

/**
 * Explicit owner-controlled first initialization, NOT a public endpoint or constructor hook.
 * Call only after independently establishing a fresh, never-used global budget namespace.
 * Existing empty/nonzero/partial schemas are all rejected, never reset or repaired.
 * A complete historical deletion is indistinguishable from a fresh namespace here;
 * the external operator must never use initialization to bypass prior consumption.
 */
export async function initializeCloudflareBudgetStore(storage: CloudflareSqliteStorage): Promise<void> {
  try {
    if (!storage || typeof storage.transactionSync !== "function" || typeof storage.sync !== "function" || typeof storage.sql?.exec !== "function") throw new CumulativeBudgetError("budget_unavailable");
    storage.transactionSync(() => {
      // __cf_kv is Cloudflare's documented hidden platform table; this module never accesses KV.
      const existing = storage.sql.exec("SELECT name FROM sqlite_master WHERE type IN ('table', 'view', 'trigger') AND name NOT LIKE 'sqlite_%' AND name <> '__cf_kv' LIMIT 1").toArray();
      if (existing.length) throw new BudgetInitializationError();
      storage.sql.exec(META_DDL).toArray();
      storage.sql.exec(RESERVATIONS_DDL).toArray();
      storage.sql.exec(ATTEMPTS_DDL).toArray();
      storage.sql.exec(COMPLETIONS_DDL).toArray();
      storage.sql.exec(`INSERT INTO ${META} (singleton, version, limit_micros, reserved_micros) VALUES (1, '1', ?, 0)`, CUMULATIVE_BUDGET_LIMIT_MICROS).toArray();
    });
    await storage.sync();
  } catch (error) { return unavailable(error); }
}
