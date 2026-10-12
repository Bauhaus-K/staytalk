import type { TenantDb } from "@/server/db/tenant";

/** Conversation with messages and the AI trace (runs + tool calls) for dashboards. */
export async function getConversationView(db: TenantDb, conversationId: string) {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      escalations: { orderBy: { createdAt: "asc" } },
      agentRuns: {
        orderBy: { createdAt: "asc" },
        include: { toolCalls: { orderBy: { sequence: "asc" } } },
      },
    },
  });
  if (!conversation) return null;

  const knowledgeIds = [...new Set(conversation.agentRuns.flatMap((r) => r.citedKnowledgeIds))];
  const cited = knowledgeIds.length
    ? await db.knowledgeItem.findMany({
        where: { id: { in: knowledgeIds } },
        select: { id: true, question: true, category: true },
      })
    : [];

  return { ...conversation, citedKnowledge: cited };
}

export type ConversationView = NonNullable<Awaited<ReturnType<typeof getConversationView>>>;
