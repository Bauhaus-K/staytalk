import type { TenantDb } from "@/server/db/tenant";

/** Start of the current month in UTC (MVP: monthly windows are UTC-based). */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Main-model tokens used by a property this month. Cache reads are weighted
 * at 0.1 (their relative price), otherwise the cached system prompt that is
 * re-read every turn would dominate the budget. Phase 4 refines this into
 * a per-model cost ledger.
 */
export async function monthlyTokenUsage(db: TenantDb, propertyId: string, now: Date) {
  const agg = await db.agentRun.aggregate({
    where: { createdAt: { gte: monthStart(now) }, conversation: { propertyId } },
    _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true },
  });
  const s = agg._sum;
  return (
    (s.inputTokens ?? 0) +
    (s.outputTokens ?? 0) +
    (s.cacheWriteTokens ?? 0) +
    Math.round((s.cacheReadTokens ?? 0) * 0.1)
  );
}

export async function isOverMonthlyLimit(
  db: TenantDb,
  property: { id: string; monthlyTokenLimit: number | null },
  now: Date,
): Promise<boolean> {
  if (property.monthlyTokenLimit == null) return false;
  return (await monthlyTokenUsage(db, property.id, now)) >= property.monthlyTokenLimit;
}
