import { readLegacyBudget, type CloudflareSqliteStorage } from "./cloudflare-budget-store.ts";
import { ADVICE_ALERT_MICROS, type AdviceBudget } from "../../lib/advice/contracts.ts";

const META = "bodymake_advice_credit_v2";
const CALLS = "bodymake_advice_calls_v2";
const RECEIPTS = "bodymake_advice_receipts_v2";
// Conservative hold for the provider's capped 64 KiB text request and 1,800
// output tokens, not the model's entire context window. Replace only with validated usage.
export const CALL_HOLD_MICROS = 250_000;
export class AdviceBudgetError extends Error { readonly code: string; constructor(code: string) { super(code); this.code = code; } }
function fail(code: string): never { throw new AdviceBudgetError(code); }
const integer = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
type Row = Record<string, unknown>;
const rows = (s: CloudflareSqliteStorage, q: string, ...b: (string | number)[]) => s.sql.exec(q, ...b).toArray() as Row[];
const schema = [
  `CREATE TABLE ${META} (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version=2), allowance INTEGER NOT NULL, legacy INTEGER NOT NULL)`,
  `CREATE TABLE ${CALLS} (id TEXT PRIMARY KEY, subject TEXT NOT NULL, input TEXT NOT NULL, reserved INTEGER NOT NULL, at INTEGER NOT NULL)`,
  `CREATE TABLE ${RECEIPTS} (id TEXT PRIMARY KEY, cost INTEGER NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL)`,
];

/** Explicit migration only, with a verified existing-credit allocation, never a reset. */
export async function initializeAdviceBudget(s: CloudflareSqliteStorage, allowance: number) {
  if (!integer(allowance, 1, 100_000_000)) fail("credit_not_verified");
  s.transactionSync(() => {
    const legacy = readLegacyBudget(s);
    if (rows(s, "SELECT name FROM sqlite_master WHERE name IN (?, ?, ?)", META, CALLS, RECEIPTS).length) fail("budget_already_initialized");
    if (legacy.reservedMicros > allowance) fail("credit_exhausted");
    schema.forEach(q => rows(s, q));
    rows(s, `INSERT INTO ${META} VALUES (1, 2, ?, ?)`, allowance, legacy.reservedMicros);
  });
  await s.sync();
}

function read(s: CloudflareSqliteStorage) {
  const names = rows(s, "SELECT name, sql FROM sqlite_master WHERE name IN (?, ?, ?)", META, CALLS, RECEIPTS);
  if (!names.length) fail("budget_uninitialized");
  if (names.length !== 3 || names.some(r => !schema.some(q => q.replace(/\s+/g, " ") === String(r.sql).replace(/\s+/g, " ")))) fail("budget_corrupt");
  if (rows(s, "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name IN (?, ?, ?)", META, CALLS, RECEIPTS).length) fail("budget_corrupt");
  const legacy = readLegacyBudget(s);
  const meta = rows(s, `SELECT * FROM ${META}`);
  if (meta.length !== 1 || meta[0].singleton !== 1 || meta[0].version !== 2 || meta[0].legacy !== legacy.reservedMicros || !integer(meta[0].allowance, 1, 100_000_000)) fail("budget_corrupt");
  const calls = rows(s, `SELECT * FROM ${CALLS} ORDER BY at, id LIMIT 10001`);
  const receipts = rows(s, `SELECT * FROM ${RECEIPTS} LIMIT 10001`);
  if (calls.length > 10000 || receipts.length > calls.length) fail("budget_corrupt");
  const completed = new Map<string, Row>();
  for (const r of receipts) {
    if (typeof r.id !== "string" || !integer(r.cost, 0, CALL_HOLD_MICROS) || !integer(r.input_tokens, 0, 922000) || !integer(r.output_tokens, 0, 1800)) fail("budget_corrupt");
    completed.set(r.id, r);
  }
  let estimated = legacy.reservedMicros; let held = 0; const seen = new Set<string>();
  for (const c of calls) {
    if (typeof c.id !== "string" || !/^[a-f0-9-]{36}$/.test(c.id) || seen.has(c.id)
      || typeof c.subject !== "string" || !/^[a-f0-9]{64}$/.test(c.subject) || typeof c.input !== "string" || !/^[a-f0-9]{64}$/.test(c.input)
      || c.reserved !== CALL_HOLD_MICROS || !integer(c.at, 1, Number.MAX_SAFE_INTEGER)) fail("budget_corrupt");
    seen.add(c.id);
    if (completed.has(c.id)) estimated += completed.get(c.id)!.cost as number;
    else held += CALL_HOLD_MICROS;
  }
  if ([...completed.keys()].some(id => !seen.has(id)) || estimated + held > meta[0].allowance || held > CALL_HOLD_MICROS) fail("budget_corrupt");
  const remaining = meta[0].allowance - estimated - held;
  return { calls, completed, budget: { limitMicros: meta[0].allowance, estimatedMicros: estimated, heldMicros: held, remainingMicros: remaining,
    stopped: held > 0 || remaining < CALL_HOLD_MICROS || calls.length >= 10000, pending: held > 0, alert: estimated >= ADVICE_ALERT_MICROS } satisfies AdviceBudget };
}
export function adviceBudget(s: CloudflareSqliteStorage): AdviceBudget { return s.transactionSync(() => read(s).budget); }
export async function reserveAdvice(s: CloudflareSqliteStorage, c: { id: string; subject: string; input: string }, now: number) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(c.id)
    || !/^[a-f0-9]{64}$/.test(c.subject) || !/^[a-f0-9]{64}$/.test(c.input) || !integer(now, 1, Number.MAX_SAFE_INTEGER)) fail("invalid_request");
  s.transactionSync(() => {
    const state = read(s);
    if (state.calls.some(x => x.id === c.id)) fail("duplicate_request");
    if (state.budget.pending) fail("provider_verification_pending");
    if (state.budget.stopped) fail("credit_exhausted");
    const recent = state.calls.filter(x => x.subject === c.subject && now - (x.at as number) < 86400000);
    if (recent.length >= 20 || recent.some(x => now - (x.at as number) < 30000)) fail("rate_limited");
    rows(s, `INSERT INTO ${CALLS} VALUES (?, ?, ?, ?, ?)`, c.id, c.subject, c.input, CALL_HOLD_MICROS, now);
  });
  await s.sync(); // Never invoke a paid request before durable acknowledgement.
}
export async function settleAdvice(s: CloudflareSqliteStorage, id: string, usage: { costMicros: number; inputTokens: number; outputTokens: number }) {
  if (!integer(usage.costMicros, 0, CALL_HOLD_MICROS) || !integer(usage.inputTokens, 0, 922000) || !integer(usage.outputTokens, 0, 1800)) fail("provider_cost_unconfirmed");
  s.transactionSync(() => {
    const state = read(s);
    if (!state.calls.some(c => c.id === id) || state.completed.has(id) || !state.budget.pending) fail("budget_corrupt");
    rows(s, `INSERT INTO ${RECEIPTS} VALUES (?, ?, ?, ?)`, id, usage.costMicros, usage.inputTokens, usage.outputTokens);
  });
  await s.sync();
}
