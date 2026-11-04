import type { RecommendationRequest, RecommendationResult } from "./types.ts";

const gateway = "http://127.0.0.1:3004";
// Compile production destinations out of all test bundles, not merely hide their UI.
const productionGateway = process.env.NEXT_PUBLIC_BODYMAKE_ENV === "test"
  ? "" : "https://bodymake-recommendation-api.ajimo023.workers.dev";
export const recommendationConsentVersion = "recommendation-api-v1";
export const featureVersion = "recommendation-features-v1";

export function isLocalRecommendationOrigin(origin: string): boolean {
  return origin === "http://localhost:3001" || origin === "http://127.0.0.1:3001";
}

export function isProductionRecommendationOrigin(origin: string): boolean {
  if (process.env.NEXT_PUBLIC_BODYMAKE_ENV === "test") return false;
  return origin === "https://healthapp-14a3f.web.app" || origin === "https://healthapp-14a3f.firebaseapp.com";
}

export function validateRanking(value: unknown, request: RecommendationRequest): RecommendationResult {
  if (!value || typeof value !== "object") throw new Error("invalid_response");
  const result = value as Partial<RecommendationResult>;
  if (result.source !== "openai" || typeof result.model !== "string" || !result.model || result.model.length > 100) throw new Error("invalid_response");
  for (const [field, kind] of [["mealIds", "meal"], ["workoutIds", "workout"]] as const) {
    const ids = result[field];
    const available = new Set(request.candidates.filter((candidate) => candidate.kind === kind).map((candidate) => candidate.id));
    if (!Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length
      || ids.some((id) => typeof id !== "string" || !available.has(id))) throw new Error("invalid_response");
  }
  return { source: "openai", model: result.model, mealIds: [...result.mealIds!], workoutIds: [...result.workoutIds!],
    ...(typeof result.requestId === "string" ? { requestId: result.requestId } : {}) };
}

async function jsonRequest(path: string, init: RequestInit, fetcher: typeof fetch, base = gateway): Promise<unknown> {
  const response = await fetcher(`${base}${path}`, { ...init, cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const code = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "gateway_error";
    // Never surface arbitrary provider text, headers, credentials, or raw record bodies.
    throw new Error(/^[a-z0-9_]{1,70}$/.test(code) ? code : "gateway_error");
  }
  return body;
}

interface ProductionIdentity {
  getIdToken(): Promise<string>;
  assertCurrent(): void;
}
async function productionAuthorization(origin: string, identity: ProductionIdentity, signal?: AbortSignal): Promise<string> {
  if (!isProductionRecommendationOrigin(origin)) throw new Error("production_origin_required");
  signal?.throwIfAborted();
  identity.assertCurrent();
  const token = await identity.getIdToken();
  signal?.throwIfAborted();
  identity.assertCurrent();
  if (token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error("invalid_auth_token");
  return `Bearer ${token}`;
}

/** Explicit, authenticated readiness check. No records, reservation or OpenAI call. */
export async function checkProductionRecommendationApi(input: {
  origin: string; identity: ProductionIdentity; signal?: AbortSignal;
}, fetcher: typeof fetch = fetch): Promise<boolean> {
  const authorization = await productionAuthorization(input.origin, input.identity, input.signal);
  const value = await jsonRequest("/session", { method: "GET", signal: input.signal,
    headers: { Authorization: authorization } }, fetcher, productionGateway);
  input.signal?.throwIfAborted(); input.identity.assertCurrent();
  if (!value || typeof value !== "object" || !("authorized" in value) || value.authorized !== true
    || !("enabled" in value) || typeof value.enabled !== "boolean") throw new Error("invalid_response");
  return value.enabled;
}

/** One explicit consent -> one request. Never retries, persists tokens, or uses a local fallback. */
export async function requestProductionAiRanking(input: {
  origin: string; identity: ProductionIdentity; transferConsent: boolean;
  requestId: string; request: RecommendationRequest; signal?: AbortSignal;
}, fetcher: typeof fetch = fetch): Promise<RecommendationResult> {
  if (!input.transferConsent) throw new Error("consent_required");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.requestId)) throw new Error("invalid_request_id");
  const authorization = await productionAuthorization(input.origin, input.identity, input.signal);
  const value = await jsonRequest("/recommend", {
    method: "POST", signal: input.signal,
    headers: { "Content-Type": "application/json", Authorization: authorization },
    body: JSON.stringify({ requestId: input.requestId, transferConsent: true, request: input.request }),
  }, fetcher, productionGateway);
  input.signal?.throwIfAborted(); input.identity.assertCurrent();
  const result = validateRanking(value, input.request);
  if (result.requestId !== input.requestId || result.model !== "gpt-5.6-luna") throw new Error("invalid_response");
  return result;
}

export async function checkRecommendationApi(origin: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!isLocalRecommendationOrigin(origin)) return false;
  const value = await jsonRequest("/health", { signal }, fetcher);
  return Boolean(value && typeof value === "object" && "enabled" in value && value.enabled === true);
}

/** No automatic retries and no persistence. Reuse requestId when the outcome is unknown. */
export async function requestAiRanking(input: {
  origin: string;
  transferConsent: boolean;
  requestId: string;
  request: RecommendationRequest;
  signal?: AbortSignal;
}, fetcher: typeof fetch = fetch): Promise<RecommendationResult> {
  if (!isLocalRecommendationOrigin(input.origin)) throw new Error("local_test_only");
  if (!input.transferConsent) throw new Error("consent_required");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new Error("invalid_request_id");
  const session = await jsonRequest("/session", { signal: input.signal }, fetcher);
  if (!session || typeof session !== "object" || !("token" in session) || typeof session.token !== "string") throw new Error("invalid_session");
  const value = await jsonRequest("/recommend", {
    method: "POST", signal: input.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ requestId: input.requestId, transferConsent: true, request: input.request }),
  }, fetcher);
  const result = validateRanking(value, input.request);
  if (result.requestId !== input.requestId) throw new Error("invalid_response");
  return result;
}

export function recommendationErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "auth_owner_only") return "AIの先行利用は所有者本人だけに限定しています。端末内の候補は無料で利用できます。";
  if (/auth/.test(code)) return "ログイン本人の確認ができませんでした。アカウントを確認し、画面を読み込み直してください。APIへの自動再送はしていません。";
  if (/provider_verification_pending|provider_cost_unconfirmed/.test(code)) return "前回のAPI実行・料金を確認するまでAIを停止しています。端末内の候補を利用してください。";
  if (/pricing/.test(code)) return "API料金の確認期限が切れているため、AIを停止しています。端末内の候補は無料で利用できます。";
  if (code === "budget_duplicate_request") return "このリクエストは受付済みです。重複課金を防ぐため再送せず、端末内の候補を利用してください。";
  if (code === "consent_required") return "APIへの送信内容を確認して、今回の送信に同意してください。";
  if (/budget|limit|capacity|busy/.test(code)) return "試行回数・予算の上限、または同時処理の制限に達しました。端末内の候補を利用できます。";
  if (/disabled|not_configured|configuration/.test(code)) return "API接続は未設定または無効です。端末内の候補は無料で利用できます。";
  if (["invalid_response", "provider_bad_output"].includes(code)) return "APIの回答が候補の条件を満たさなかったため、採用しませんでした。";
  return "APIの結果を確認できませんでした。自動再送はしていません。同じリクエストを再確認するか、端末内の候補を利用してください。";
}
