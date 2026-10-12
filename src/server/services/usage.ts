import type { UsageKind } from "@/generated/prisma/enums";
import type { TenantDb } from "@/server/db/tenant";
import { estimateCostMicroUsd } from "@/server/agent/llm/pricing";
import type { LlmClient, TokenUsage } from "@/server/agent/llm/types";

/** Start of the current month in UTC (MVP: monthly windows are UTC-based). */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Share of the limit at which operators are warned. */
export const USAGE_WARNING_RATIO = 0.8;

export type UsageScope = {
  db: TenantDb;
  organizationId: string;
  propertyId: string;
  conversationId?: string | null;
};

export async function recordUsage(
  scope: UsageScope,
  kind: UsageKind,
  model: string,
  usage: TokenUsage,
) {
  await scope.db.llmUsage.create({
    data: {
      organizationId: scope.organizationId,
      propertyId: scope.propertyId,
      conversationId: scope.conversationId ?? null,
      kind,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      costMicroUsd: estimateCostMicroUsd(model, usage),
    },
  });
}

/**
 * Wraps an LLM client so every call is written to the usage ledger for the
 * given property/conversation. Accounting failures never break the call.
 */
export function trackUsage(llm: LlmClient, scope: UsageScope): LlmClient {
  const record = (kind: UsageKind, model: string, usage: TokenUsage) =>
    recordUsage(scope, kind, model, usage).catch((error) =>
      console.error("[usage] record failed", error),
    );
  return {
    mode: llm.mode,
    mainModel: llm.mainModel,
    fastModel: llm.fastModel,
    async agentTurn(request) {
      const response = await llm.agentTurn(request);
      await record("AGENT", response.model, response.usage);
      return response;
    },
    async complete(request) {
      const response = await llm.complete(request);
      await record(
        request.purpose === "language_detection" ? "LANGUAGE_DETECTION" : "TRANSLATION",
        response.model,
        response.usage,
      );
      return response;
    },
  };
}

/**
 * Tokens counted against the monthly limit. Cache reads are weighted at 0.1
 * (their relative price); otherwise the cached system prompt re-read every
 * turn would dominate the budget.
 */
export async function monthlyTokenUsage(db: TenantDb, propertyId: string, now: Date) {
  const agg = await db.llmUsage.aggregate({
    where: { propertyId, createdAt: { gte: monthStart(now) } },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      cacheReadTokens: true,
      cacheWriteTokens: true,
      costMicroUsd: true,
    },
  });
  const s = agg._sum;
  return {
    tokens:
      (s.inputTokens ?? 0) +
      (s.outputTokens ?? 0) +
      (s.cacheWriteTokens ?? 0) +
      Math.round((s.cacheReadTokens ?? 0) * 0.1),
    costMicroUsd: s.costMicroUsd ?? 0,
  };
}

export async function isOverMonthlyLimit(
  db: TenantDb,
  property: { id: string; monthlyTokenLimit: number | null },
  now: Date,
): Promise<boolean> {
  if (property.monthlyTokenLimit == null) return false;
  return (await monthlyTokenUsage(db, property.id, now)).tokens >= property.monthlyTokenLimit;
}

/** Current-month usage vs limit, for dashboard banners and metrics. */
export async function usageStatus(
  db: TenantDb,
  property: { id: string; monthlyTokenLimit: number | null },
  now = new Date(),
) {
  const usage = await monthlyTokenUsage(db, property.id, now);
  const limit = property.monthlyTokenLimit;
  const ratio = limit ? usage.tokens / limit : null;
  return {
    ...usage,
    limit,
    ratio,
    level:
      ratio == null ? "ok" : ratio >= 1 ? "over" : ratio >= USAGE_WARNING_RATIO ? "warning" : "ok",
  } as const;
}
