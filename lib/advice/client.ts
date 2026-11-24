import { ADVICE_ENDPOINT, object, validateAdvice, type AdviceBudget, type AdviceInput } from "./contracts.ts";
import { summarizeAdviceRecords } from "./summary.ts";
import type { RecommendationIdentity } from "./identity.ts";

export const adviceErrorText: Record<string, string> = {
  credit_not_verified: "既存のAPIクレジットと自動追加購入の設定を確認してから利用できます。まだAPIへの送信は行っていません。",
  auth_not_configured: "APIの利用設定を確認中です。まだAPIへの送信は行っていません。",
  auth_owner_only: "現在はAPIクレジットの所有者本人だけが利用できます。",
  auth_required: "Googleでログインしてから利用してください。",
  recommendation_auth_required: "Googleでログインしてから利用してください。",
  recommendation_auth_unavailable: "ログイン状態を確認できません。通信状態を確認してからやり直してください。",
  invalid_auth_token: "ログイン状態を確認できません。ログインし直してください。",
  auth_revoked: "ログイン状態が変更されました。ログインし直してください。",
  records_unavailable: "最新の記録を取得できませんでした。通信状態を確認してください。",
  records_changed: "記録が更新されました。最新の内容を確認して、もう一度送信してください。",
  recommendation_auth_changed: "アカウントが変わったため、表示と送信の同意を解除しました。",
  credit_exhausted: "確認済みクレジットの利用枠が不足しているため停止しました。追加購入は行いません。",
  rate_limited: "少し時間を空けてください。利用は30秒に1回、24時間に20回までです。",
  request_in_progress: "別のアドバイスを作成中です。完了後に確認してください。",
  duplicate_request: "同じ送信は実行済みのため、再課金を防いで停止しました。",
  provider_verification_pending: "前回の利用額を確認できないため一時停止しています。再送は行いません。",
  provider_bad_output: "回答を安全に表示できませんでした。利用額は更新しました。自動で再送はしません。",
  provider_timeout: "応答の確認が時間内に終わりませんでした。料金を確認するまで再送しません。",
  pricing_review_required: "料金の確認期限を過ぎたため、確認が終わるまで一時停止しています。",
};
export function errorText(e: unknown) {
  return e instanceof Error ? adviceErrorText[e.message] ?? "接続を確認できませんでした。自動で再送はしません。" : "接続を確認できませんでした。";
}
class AdviceResponseError extends Error {
  readonly budget: AdviceBudget | null;
  constructor(code: string, updated: AdviceBudget | null = null) { super(code); this.budget = updated; }
}
export function budgetFromError(e: unknown): AdviceBudget | null { return e instanceof AdviceResponseError ? e.budget : null; }
function budget(v: unknown): AdviceBudget {
  if (!object(v) || !["limitMicros", "estimatedMicros", "heldMicros", "remainingMicros"].every(k => typeof v[k] === "number" && Number.isSafeInteger(v[k]) && (v[k] as number) >= 0)
    || typeof v.stopped !== "boolean" || typeof v.pending !== "boolean" || typeof v.alert !== "boolean"
    || (v.estimatedMicros as number) + (v.heldMicros as number) + (v.remainingMicros as number) !== v.limitMicros) throw new Error("invalid_response");
  return v as AdviceBudget;
}
export async function readAdviceInput(identity: RecommendationIdentity, date: string, constraints: string): Promise<AdviceInput> {
  identity.assertCurrent();
  const [{ firebaseDb }, f] = await Promise.all([import("../firebase/app.ts"), import("firebase/firestore")]);
  const db = firebaseDb(); const base = ["users", identity.uid] as const;
  const first = new Date(Date.parse(date) - 6 * 86400000).toISOString().slice(0, 10);
  try {
    const [profile, meals, workouts, preferences] = await Promise.all([
      f.getDocFromServer(f.doc(db, ...base, "profile", "main")),
      f.getDocsFromServer(f.query(f.collection(db, ...base, "meals"), f.where("recordedAt", ">=", first), f.where("recordedAt", "<=", date), f.limit(500))),
      f.getDocsFromServer(f.query(f.collection(db, ...base, "workouts"), f.where("performedAt", ">=", first), f.where("performedAt", "<=", date), f.limit(500))),
      f.getDocFromServer(f.doc(db, ...base, "settings", "workout-preferences")),
    ]);
    identity.assertCurrent();
    if ([profile, meals, workouts, preferences, ...meals.docs, ...workouts.docs].some(s => s.metadata.fromCache || s.metadata.hasPendingWrites)
      || meals.size >= 500 || workouts.size >= 500) throw new Error("records_unavailable");
    return summarizeAdviceRecords({ profile: profile.exists() ? profile.data() : null, meals: meals.docs.map(s => s.data()),
      workouts: workouts.docs.map(s => s.data()), preferences: preferences.exists() ? preferences.data() : {} }, date, constraints);
  } catch (e) { identity.assertCurrent(); if (e instanceof Error && e.message === "recommendation_auth_changed") throw e; throw new Error("records_unavailable"); }
}
async function request(identity: RecommendationIdentity, path: "/session" | "/advice", body?: unknown, fetcher = fetch) {
  identity.assertCurrent(); const token = await identity.getIdToken(); identity.assertCurrent();
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 60000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const r = await fetcher(ADVICE_ENDPOINT + path, { method: body ? "POST" : "GET", mode: "cors", credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!r.body || !r.headers.get("Content-Type")?.startsWith("application/json")) throw new Error("invalid_response");
    reader = r.body.getReader(); let bytes = 0; let text = "";
    const decoder = new TextDecoder("utf-8", { fatal: true });
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > 65536) throw new Error("invalid_response");
      text += decoder.decode(chunk.value, { stream: true });
    }
    const raw: unknown = JSON.parse(text + decoder.decode()); identity.assertCurrent();
    if (!object(raw)) throw new Error("invalid_response");
    if (!r.ok) throw new AdviceResponseError(typeof raw.error === "string" ? raw.error : "request_failed", raw.budget ? budget(raw.budget) : null);
    return raw;
  } finally { clearTimeout(timer); void reader?.cancel().catch(() => undefined); }
}
export async function readAdviceBudget(identity: RecommendationIdentity) { return budget((await request(identity, "/session")).budget); }

/** Revalidate the consented snapshot just before sending; no automatic retry or persistent cache. */
export async function generateAdvice(identity: RecommendationIdentity, preview: AdviceInput, read: () => Promise<AdviceInput>, fetcher = fetch) {
  identity.assertCurrent(); const current = await read(); identity.assertCurrent();
  if (JSON.stringify(current) !== JSON.stringify(preview)) throw new Error("records_changed");
  const r = await request(identity, "/advice", { requestId: crypto.randomUUID(), transferConsent: true, input: current }, fetcher);
  const updated = budget(r.budget);
  try {
    let advice;
    try { advice = validateAdvice(r.advice, current); } catch { throw new Error("provider_bad_output"); }
    identity.assertCurrent(); const after = await read(); identity.assertCurrent();
    if (JSON.stringify(after) !== JSON.stringify(current)) throw new Error("records_changed");
    return { advice, budget: updated };
  } catch (e) {
    identity.assertCurrent(); // Never expose the previous account's budget after an account switch.
    throw new AdviceResponseError(e instanceof Error ? e.message : "request_failed", updated);
  }
}
