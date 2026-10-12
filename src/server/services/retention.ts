import type { DbClient } from "@/server/db/client";
import { forOrg } from "@/server/db/tenant";
import { addDays } from "@/lib/dates";

export const DEFAULT_RETENTION_DAYS = 90;
export const MASKED = "[masked]";

/**
 * Batch: data minimisation for old conversations. After `retentionDays`
 * without activity, message bodies (guest, AI, staff — any may contain names
 * or contact details), escalation texts, tool-call payloads and channel user
 * ids are replaced; metadata (roles, languages, timestamps, statuses, token
 * counts) is kept so metrics stay intact. Booking requests lose guest name,
 * contact and notes once their checkout is older than the retention period.
 */
export async function maskOldConversations(
  client: DbClient,
  now = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS,
) {
  const cutoff = addDays(now, -retentionDays);
  const conversations = await client.conversation.findMany({
    where: { maskedAt: null, lastMessageAt: { lt: cutoff } },
    select: { id: true, organizationId: true },
    take: 500,
  });

  for (const c of conversations) {
    const db = forOrg(c.organizationId, client);
    await db.message.updateMany({
      where: { conversationId: c.id },
      data: { content: MASKED, translatedContent: null },
    });
    await db.escalation.updateMany({
      where: { conversationId: c.id },
      data: { summary: MASKED, question: null },
    });
    await db.toolCall.updateMany({
      where: { agentRun: { conversationId: c.id } },
      data: { input: {}, output: {} },
    });
    await db.conversation.update({
      where: { id: c.id },
      data: { maskedAt: now, externalUserId: null, guestSessionId: null },
    });
  }

  // Raw query over all tenants is fine for a batch job; writes are scoped.
  const bookings = await client.bookingRequest.findMany({
    where: { checkOut: { lt: cutoff }, NOT: { guestName: MASKED } },
    select: { id: true, organizationId: true },
    take: 1000,
  });
  for (const b of bookings) {
    await forOrg(b.organizationId, client).bookingRequest.update({
      where: { id: b.id },
      data: { guestName: MASKED, guestContact: MASKED, note: null, declineNote: null },
    });
  }

  return { conversations: conversations.length, bookings: bookings.length };
}
