import type { TenantDb } from "@/server/db/tenant";

/**
 * Questions the AI could not answer (UNKNOWN_ANSWER escalations) that staff
 * hasn't turned into knowledge or dismissed yet, newest first.
 */
export async function listUnansweredQuestions(db: TenantDb, propertyId: string, take = 50) {
  const rows = await db.escalation.findMany({
    where: {
      reason: "UNKNOWN_ANSWER",
      addedKnowledgeItemId: null,
      knowledgeDismissedAt: null,
      question: { not: null },
      conversation: { propertyId, isTest: false },
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { conversation: { select: { id: true, guestLanguage: true } } },
  });
  // Staff-language translation of the original guest message, when stored.
  const translations = await db.message.findMany({
    where: {
      role: "GUEST",
      conversationId: { in: rows.map((r) => r.conversationId) },
      content: { in: rows.map((r) => r.question!) },
    },
    select: { conversationId: true, content: true, translatedContent: true },
  });
  const key = (conversationId: string, content: string) => `${conversationId}\u0000${content}`;
  const byKey = new Map(
    translations.map((t) => [key(t.conversationId, t.content), t.translatedContent]),
  );
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    question: r.question!,
    translated: byKey.get(key(r.conversationId, r.question!)) ?? null,
    guestLanguage: r.conversation.guestLanguage,
    createdAt: r.createdAt,
  }));
}

export function countUnansweredQuestions(db: TenantDb, propertyId: string) {
  return db.escalation.count({
    where: {
      reason: "UNKNOWN_ANSWER",
      addedKnowledgeItemId: null,
      knowledgeDismissedAt: null,
      question: { not: null },
      conversation: { propertyId, isTest: false },
    },
  });
}
