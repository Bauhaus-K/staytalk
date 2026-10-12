import { deliverToGuest } from "@/server/channels/registry";
import type { TenantDb } from "@/server/db/tenant";
import type { LlmClient } from "@/server/agent/llm/types";
import { detectLanguageHeuristic } from "@/server/language/detect";
import { translateText } from "@/server/language/translate";

export const MAX_STAFF_MESSAGE_LENGTH = 4000;

export class ConversationNotFoundError extends Error {}

/**
 * Staff replies directly to a guest. The original is kept; the guest gets a
 * translation into their language. Replying pauses the AI (conversation
 * becomes ESCALATED) until staff resolves it or hands it back.
 */
export async function sendStaffReply(
  db: TenantDb,
  llm: LlmClient,
  input: {
    organizationId: string;
    conversationId: string;
    userId: string;
    text: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const text = input.text.trim().slice(0, MAX_STAFF_MESSAGE_LENGTH);
  if (!text) throw new Error("Empty reply");

  const conversation = await db.conversation.findUnique({
    where: { id: input.conversationId },
    include: { property: { select: { staffLanguage: true } } },
  });
  if (!conversation) throw new ConversationNotFoundError();

  const staffLanguage =
    detectLanguageHeuristic(text)?.language ?? conversation.property.staffLanguage;
  const guestLanguage = conversation.guestLanguage;
  const translation = guestLanguage
    ? await translateText(llm, text, staffLanguage, guestLanguage)
    : null;

  const message = await db.message.create({
    data: {
      organizationId: input.organizationId,
      conversationId: conversation.id,
      role: "STAFF",
      content: text,
      language: staffLanguage,
      translatedContent: translation?.text ?? null,
      translatedLanguage: translation ? guestLanguage : null,
      authorUserId: input.userId,
    },
  });

  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      status: "ESCALATED",
      resolvedBy: null,
      resolvedAt: null,
      // A staff reply is itself the notice; the AI stays silent.
      escalationNoticeSent: true,
      lastMessageAt: now,
    },
  });
  await db.escalation.updateMany({
    where: { conversationId: conversation.id, status: "OPEN", firstResponseAt: null },
    data: { firstResponseAt: now },
  });

  await deliverToGuest(
    conversation.channel,
    {
      conversationId: conversation.id,
      guestSessionId: conversation.guestSessionId,
      externalUserId: conversation.externalUserId,
    },
    [{ text: translation?.text ?? text }],
  );
  return message;
}

async function closeEscalations(db: TenantDb, conversationId: string, userId: string, now: Date) {
  await db.escalation.updateMany({
    where: { conversationId, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: now, resolvedById: userId },
  });
}

/** Staff marks the conversation as handled. */
export async function resolveConversation(
  db: TenantDb,
  input: { conversationId: string; userId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const result = await db.conversation.updateMany({
    where: { id: input.conversationId },
    data: { status: "RESOLVED", resolvedBy: "HUMAN", resolvedAt: now },
  });
  if (result.count === 0) throw new ConversationNotFoundError();
  await closeEscalations(db, input.conversationId, input.userId, now);
}

/** Staff hands the conversation back to the AI (e.g. after answering the open question). */
export async function returnToAi(
  db: TenantDb,
  input: { conversationId: string; userId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const result = await db.conversation.updateMany({
    where: { id: input.conversationId },
    data: {
      status: "AI_HANDLING",
      resolvedBy: null,
      resolvedAt: null,
      escalationNoticeSent: false,
    },
  });
  if (result.count === 0) throw new ConversationNotFoundError();
  await closeEscalations(db, input.conversationId, input.userId, now);
}
