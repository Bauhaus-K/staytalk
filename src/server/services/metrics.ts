import type { BookingStatus, EscalationReason, UsageKind } from "@/generated/prisma/enums";
import type { TenantDb } from "@/server/db/tenant";
import { addDays, localMidnightUtc, toIsoDate } from "@/lib/dates";

export const METRIC_RANGES = [7, 30, 90] as const;
export type MetricRange = (typeof METRIC_RANGES)[number];

function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type PropertyMetrics = Awaited<ReturnType<typeof getPropertyMetrics>>;

/**
 * Pilot KPIs for one property over the local calendar days [from, to)
 * (dates in the UTC-midnight convention, interpreted in `timezone`). Test (playground/eval)
 * conversations are excluded everywhere except LLM cost, which is real spend.
 *
 * Automation rate = conversations resolved by AI / all resolved conversations
 * (resolved = closed by staff, or closed by the idle job; see lifecycle.ts).
 */
export async function getPropertyMetrics(
  db: TenantDb,
  params: { propertyId: string; timezone: string; from: Date; to: Date },
) {
  const { propertyId, timezone, from, to } = params;
  const range = { gte: localMidnightUtc(from, timezone), lt: localMidnightUtc(to, timezone) };
  const conversationScope = { propertyId, isTest: false };

  const [conversationRows, resolved, open, languages, escalations, bookings, usageByKind] =
    await Promise.all([
      db.conversation.findMany({
        where: { ...conversationScope, createdAt: range },
        select: { createdAt: true },
      }),
      db.conversation.groupBy({
        by: ["resolvedBy"],
        where: { ...conversationScope, createdAt: range, status: "RESOLVED" },
        _count: { _all: true },
      }),
      db.conversation.groupBy({
        by: ["status"],
        where: { ...conversationScope, createdAt: range, status: { not: "RESOLVED" } },
        _count: { _all: true },
      }),
      db.conversation.groupBy({
        by: ["guestLanguage"],
        where: { ...conversationScope, createdAt: range },
        _count: { _all: true },
      }),
      db.escalation.findMany({
        where: { createdAt: range, conversation: conversationScope },
        select: { reason: true, createdAt: true, firstResponseAt: true },
      }),
      db.bookingRequest.groupBy({
        by: ["status"],
        where: { propertyId, createdAt: range },
        _count: { _all: true },
      }),
      db.llmUsage.groupBy({
        by: ["kind"],
        where: { propertyId, createdAt: range },
        _sum: { costMicroUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true },
      }),
    ]);

  // Daily series in the property's calendar, including empty days.
  const days: { date: string; count: number }[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push({ date: toIsoDate(d), count: 0 });
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));
  for (const row of conversationRows) {
    const i = dayIndex.get(localDate(row.createdAt, timezone));
    if (i !== undefined) days[i]!.count++;
  }

  const resolvedByAi = resolved.find((r) => r.resolvedBy === "AI")?._count._all ?? 0;
  const resolvedTotal = resolved.reduce((n, r) => n + r._count._all, 0);

  const reasonCounts = new Map<EscalationReason, number>();
  for (const e of escalations) reasonCounts.set(e.reason, (reasonCounts.get(e.reason) ?? 0) + 1);
  const responseMinutes = escalations
    .filter((e) => e.firstResponseAt)
    .map((e) => (e.firstResponseAt!.getTime() - e.createdAt.getTime()) / 60_000);

  const bookingCount = (s: BookingStatus) => bookings.find((b) => b.status === s)?._count._all ?? 0;
  const decided = bookingCount("APPROVED") + bookingCount("DECLINED") + bookingCount("EXPIRED");

  const byKind = new Map<UsageKind, number>(
    usageByKind.map((u) => [u.kind, u._sum.costMicroUsd ?? 0]),
  );

  return {
    conversations: { total: conversationRows.length, byDay: days },
    automation: {
      resolved: resolvedTotal,
      resolvedByAi,
      resolvedByHuman: resolvedTotal - resolvedByAi,
      rate: resolvedTotal ? resolvedByAi / resolvedTotal : null,
      aiHandling: open.find((o) => o.status === "AI_HANDLING")?._count._all ?? 0,
      escalated: open.find((o) => o.status === "ESCALATED")?._count._all ?? 0,
    },
    languages: languages
      .map((l) => ({ language: l.guestLanguage ?? "unknown", count: l._count._all }))
      .sort((a, b) => b.count - a.count || a.language.localeCompare(b.language)),
    escalations: {
      total: escalations.length,
      byReason: [...reasonCounts]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
      firstResponse: {
        count: responseMinutes.length,
        avgMinutes: responseMinutes.length
          ? responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length
          : null,
        medianMinutes: median(responseMinutes),
      },
    },
    bookings: {
      total: bookings.reduce((n, b) => n + b._count._all, 0),
      pending: bookingCount("PENDING"),
      approved: bookingCount("APPROVED"),
      declined: bookingCount("DECLINED"),
      expired: bookingCount("EXPIRED"),
      approvalRate: decided ? bookingCount("APPROVED") / decided : null,
    },
    cost: {
      totalMicroUsd: [...byKind.values()].reduce((a, b) => a + b, 0),
      byKind: Object.fromEntries(byKind) as Partial<Record<UsageKind, number>>,
    },
  };
}

/** Start of the range in the property's calendar (UTC-midnight date convention). */
export function rangeStart(today: Date, days: MetricRange): Date {
  return addDays(today, -(days - 1));
}
