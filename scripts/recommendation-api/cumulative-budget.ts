/** USD in integer millionths. This feature's lifetime ceiling never follows a calendar. */
export const CUMULATIVE_BUDGET_LIMIT_MICROS = 5_000_000;
/** Bound operational storage as well as money; reaching this limit also fails closed. */
export const MAX_CUMULATIVE_BUDGET_RESERVATIONS = 10_000;

export interface BudgetReservation {
  requestId: string;
  subjectHash: string;
  inputHash: string;
  upperBoundMicros: number;
}

export interface CumulativeBudgetLedger {
  version: "1";
  limitMicros: typeof CUMULATIVE_BUDGET_LIMIT_MICROS;
  reservedMicros: number;
  reservations: BudgetReservation[];
}

export interface BudgetTransaction<T> {
  ledger: CumulativeBudgetLedger;
  result: T;
}

/**
 * The adapter MUST transact against ONE durable global ledger, not one per user,
 * request, process, deployment, or month. It MUST serialize concurrent callers,
 * atomically read/modify/commit, and resolve the result ONLY after durable commit.
 * A thrown/rejected operation MUST NOT commit. Store failures MUST reject.
 * Retrying the pure operation internally is safe; invoking a provider inside it is not.
 * Missing storage MUST remain missing: initialization is a separate explicit action.
 * Do not restore an older snapshot, expire entries, or recreate an absent ledger.
 */
export interface AtomicBudgetStore {
  transaction<T>(operation: (current: unknown) => BudgetTransaction<T>): Promise<T>;
}

export type CumulativeBudgetErrorCode =
  | "budget_invalid_request"
  | "budget_uninitialized"
  | "budget_corrupt"
  | "budget_unavailable"
  | "budget_duplicate_request"
  | "budget_request_conflict"
  | "budget_exhausted"
  | "budget_capacity_reached";

export class CumulativeBudgetError extends Error {
  readonly code: CumulativeBudgetErrorCode;
  constructor(code: CumulativeBudgetErrorCode) {
    super(code);
    this.name = "CumulativeBudgetError";
    this.code = code;
  }
}

export interface BudgetReservationDecision {
  status: "reserved" | "duplicate";
  /** Only the caller receiving the first committed reservation may invoke the provider. */
  canCallProvider: boolean;
  upperBoundMicros: number;
  totalReservedMicros: number;
  remainingMicros: number;
}

const RESERVATION_KEYS = ["requestId", "subjectHash", "inputHash", "upperBoundMicros"];
const LEDGER_KEYS = ["version", "limitMicros", "reservedMicros", "reservations"];
const HASH = /^[a-f0-9]{64}$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(code: CumulativeBudgetErrorCode): never {
  throw new CumulativeBudgetError(code);
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) =>
    typeof key === "string" && keys.includes(key) && "value" in Object.getOwnPropertyDescriptor(value, key)!,
  );
}

function micros(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= CUMULATIVE_BUDGET_LIMIT_MICROS;
}

function reservation(value: unknown, code: CumulativeBudgetErrorCode): BudgetReservation {
  if (!exactRecord(value, RESERVATION_KEYS)
    || typeof value.requestId !== "string" || value.requestId.length !== 36 || !REQUEST_ID.test(value.requestId)
    || typeof value.subjectHash !== "string" || value.subjectHash.length !== 64 || !HASH.test(value.subjectHash)
    || typeof value.inputHash !== "string" || value.inputHash.length !== 64 || !HASH.test(value.inputHash)
    || !micros(value.upperBoundMicros, 1)) fail(code);
  return { requestId: value.requestId, subjectHash: value.subjectHash, inputHash: value.inputHash, upperBoundMicros: value.upperBoundMicros };
}

/** Strict reconstruction rejects unknown fields, accidental health data, and corrupt totals. */
function ledger(value: unknown): CumulativeBudgetLedger {
  if (value === null || value === undefined) fail("budget_uninitialized");
  if (!exactRecord(value, LEDGER_KEYS) || value.version !== "1"
    || value.limitMicros !== CUMULATIVE_BUDGET_LIMIT_MICROS || !micros(value.reservedMicros, 0)
    || !Array.isArray(value.reservations) || value.reservations.length > MAX_CUMULATIVE_BUDGET_RESERVATIONS) fail("budget_corrupt");
  const entries = value.reservations;
  // Arrays must be dense and contain only their indexed elements plus length.
  if (Reflect.ownKeys(entries).length !== entries.length + 1) fail("budget_corrupt");
  const reservations: BudgetReservation[] = [];
  const keys = new Set<string>();
  let total = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(entries, String(index));
    if (!descriptor || !("value" in descriptor)) fail("budget_corrupt");
    const entry = reservation(descriptor.value, "budget_corrupt");
    const key = `${entry.subjectHash}:${entry.requestId}`;
    if (keys.has(key)) fail("budget_corrupt");
    keys.add(key);
    total += entry.upperBoundMicros;
    if (!micros(total, 0)) fail("budget_corrupt");
    reservations.push(entry);
  }
  if (total !== value.reservedMicros) fail("budget_corrupt");
  return { version: "1", limitMicros: CUMULATIVE_BUDGET_LIMIT_MICROS, reservedMicros: total, reservations };
}

/**
 * Reserve a caller-verified conservative cost upper bound BEFORE any paid request.
 * subjectHash must be an opaque server-derived user hash (prefer keyed HMAC), never
 * a raw UID/email. inputHash covers canonical validated input, not the input itself.
 * Neither provider responses nor health records belong in this operational ledger.
 *
 * No refund/finalize/reset API exists: successes, failures, refusals, timeouts,
 * process crashes, and unknown outcomes all retain the full reservation forever.
 * The ceiling bounds RESERVED costs. Actual billing is bounded only if the caller's
 * verified upper bound covers the selected model's complete input/output costs and
 * every paid call uses this same ledger; unrelated account usage is not controlled.
 * This core neither configures Cloudflare nor guarantees its free-tier enforcement;
 * infrastructure cost limits and actual provider pricing require separate integration.
 */
export async function reserveCumulativeBudget(store: AtomicBudgetStore, input: BudgetReservation): Promise<BudgetReservationDecision> {
  let wanted: BudgetReservation;
  try { wanted = reservation(input, "budget_invalid_request"); }
  catch { return fail("budget_invalid_request"); }
  try {
    return await store.transaction<BudgetReservationDecision>((current) => {
      let saved: CumulativeBudgetLedger;
      try { saved = ledger(current); }
      catch (error) {
        if (error instanceof CumulativeBudgetError) throw error;
        return fail("budget_corrupt");
      }
      const previous = saved.reservations.find((entry) => entry.subjectHash === wanted.subjectHash && entry.requestId === wanted.requestId);
      if (previous && previous.inputHash !== wanted.inputHash) fail("budget_request_conflict");
      if (previous) {
        return { ledger: saved, result: {
          status: "duplicate" as const, canCallProvider: false, upperBoundMicros: previous.upperBoundMicros,
          totalReservedMicros: saved.reservedMicros, remainingMicros: CUMULATIVE_BUDGET_LIMIT_MICROS - saved.reservedMicros,
        } };
      }
      if (saved.reservedMicros + wanted.upperBoundMicros > CUMULATIVE_BUDGET_LIMIT_MICROS) fail("budget_exhausted");
      if (saved.reservations.length >= MAX_CUMULATIVE_BUDGET_RESERVATIONS) fail("budget_capacity_reached");
      const updated: CumulativeBudgetLedger = {
        ...saved, reservedMicros: saved.reservedMicros + wanted.upperBoundMicros,
        reservations: [...saved.reservations, wanted],
      };
      return { ledger: updated, result: {
        status: "reserved" as const, canCallProvider: true, upperBoundMicros: wanted.upperBoundMicros,
        totalReservedMicros: updated.reservedMicros, remainingMicros: CUMULATIVE_BUDGET_LIMIT_MICROS - updated.reservedMicros,
      } };
    });
  } catch (error) {
    if (error instanceof CumulativeBudgetError) throw error;
    // Never surface store errors, credentials, provider responses, or private data.
    return fail("budget_unavailable");
  }
}

/**
 * The paid-call boundary: no provider call before a confirmed durable reservation,
 * and no retry after duplication, uncertain storage outcome, or provider failure.
 * The provider callback executes outside the transaction so transaction retries
 * cannot repeat paid work. Its return value is passed through in RAM only.
 * The callback MUST disable SDK/HTTP automatic retries and issue at most one paid
 * request covered by the verified upper bound; this wrapper cannot inspect its internals.
 * Provider errors propagate to the caller's safe error boundary; no error is logged.
 * This is not yet a Cloudflare adapter or an independently verified pricing bound.
 */
export async function invokeWithCumulativeBudget<T>(
  store: AtomicBudgetStore,
  input: BudgetReservation,
  invoke: () => T | Promise<T>,
): Promise<T> {
  if (typeof invoke !== "function") fail("budget_invalid_request");
  const decision = await reserveCumulativeBudget(store, input);
  if (!decision.canCallProvider) fail("budget_duplicate_request");
  // Any synchronous throw or rejection leaves the full committed reservation intact.
  return await invoke();
}
