import type { DbClient } from "@/server/db/client";
import { forOrg } from "@/server/db/tenant";

export const IDLE_HOURS = 24;

/**
 * Batch: closes AI-handled conversations that have been idle for
 * `idleHours`. A conversation counts as resolved by AI only if no staff
 * member ever stepped in (no escalation, no staff message) — this is the
 * basis of the automation-rate metric.
 */
export async function closeIdleConversations(
  client: DbClient,
  now = new Date(),
  idleHours = IDLE_HOURS,
) {
  const cutoff = new Date(now.getTime() - idleHours * 3_600_000);
  const idle = await client.conversation.findMany({
    where: { status: "AI_HANDLING", lastMessageAt: { lt: cutoff } },
    select: { id: true, organizationId: true },
    take: 1000,
  });
  let ai = 0;
  let human = 0;
  for (const row of idle) {
    const db = forOrg(row.organizationId, client);
    const [escalations, staffMessages] = await Promise.all([
      db.escalation.count({ where: { conversationId: row.id } }),
      db.message.count({ where: { conversationId: row.id, role: "STAFF" } }),
    ]);
    const resolvedBy = escalations + staffMessages === 0 ? "AI" : "HUMAN";
    const updated = await db.conversation.updateMany({
      where: { id: row.id, status: "AI_HANDLING", lastMessageAt: { lt: cutoff } },
      data: { status: "RESOLVED", resolvedBy, resolvedAt: now },
    });
    if (updated.count) {
      if (resolvedBy === "AI") ai++;
      else human++;
    }
  }
  return { closed: ai + human, resolvedByAi: ai, resolvedByHuman: human };
}
