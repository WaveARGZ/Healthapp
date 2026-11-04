import { RecommendationApiError } from "./provider.ts";

export interface ProductionPricingEnvironment {
  BODYMAKE_PRICING_VERIFIED_AT?: string;
}

/**
 * Initial conservative policy, not an estimate of actual usage or billing.
 * Official rate card checked 2026-11-04:
 * https://developers.openai.com/api/docs/models/gpt-5.6-luna
 * Maximum input: 922,000; input $0.20/M; cache writes x1.25;
 * long context input x2 and output x1.5; output $1.20/M.
 * Cover the ENTIRE supported input window (not a characters/token guess),
 * including schema/instructions, and all 400 possible output/reasoning tokens:
 * 922000 * .20 * 1.25 * 2 / 1e6 + 400 * 1.20 * 1.5 / 1e6 = $0.46172.
 * Reserve $0.50, never refund. Thus at most 10 requests, usually stopping well
 * before $5 of actual charges. No tools, regional endpoint, priority tier,
 * conversation state, retry, auto model fallback, or separate learning call.
 * Account-specific surcharges and other applications are outside this bound.
 * A checked timestamp is not proof prices cannot change; keep disabled until
 * the operator has rechecked current rates AND account-specific conditions.
 */
export function getProductionCostPolicy(env: ProductionPricingEnvironment, nowMs = Date.now()) {
  const verifiedAt = env.BODYMAKE_PRICING_VERIFIED_AT;
  if (!verifiedAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(verifiedAt)) {
    throw new RecommendationApiError("pricing_not_verified", 503);
  }
  const checkedMs = Date.parse(verifiedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(checkedMs)
    || new Date(checkedMs).toISOString() !== verifiedAt || checkedMs > nowMs
    || nowMs - checkedMs >= 24 * 60 * 60 * 1000) {
    throw new RecommendationApiError("pricing_verification_expired", 503);
  }
  return {
    model: "gpt-5.6-luna" as const,
    maximumInputTokens: 922_000,
    maxOutputTokens: 400,
    upperBoundMicros: 500_000,
    timeoutMs: 20_000,
    serviceTier: "default" as const,
    reasoningEffort: "none" as const,
  };
}
