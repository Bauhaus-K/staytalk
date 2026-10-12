import type { EscalationReason } from "@/generated/prisma/enums";
import type { ToolContext } from "@/server/agent/tools/types";

/**
 * Opens an escalation, moves the conversation to ESCALATED and notifies staff.
 * Records it on the run state so the agent loop and service can react.
 */
export async function escalateConversation(
  ctx: Pick<
    ToolContext,
    "db" | "organizationId" | "conversationId" | "property" | "guestMessage" | "notifier" | "state"
  >,
  input: { reason: EscalationReason; summary: string },
) {
  const escalation = await ctx.db.escalation.create({
    data: {
      organizationId: ctx.organizationId,
      conversationId: ctx.conversationId,
      reason: input.reason,
      summary: input.summary,
      question: ctx.guestMessage,
    },
  });
  await ctx.db.conversation.update({
    where: { id: ctx.conversationId },
    data: { status: "ESCALATED", resolvedBy: null, resolvedAt: null },
  });
  ctx.state.escalation = { id: escalation.id, reason: input.reason };

  try {
    await ctx.notifier.escalationCreated({
      organizationId: ctx.organizationId,
      propertyId: ctx.property.id,
      propertyName: ctx.property.name,
      conversationId: ctx.conversationId,
      escalationId: escalation.id,
      reason: input.reason,
      summary: input.summary,
    });
  } catch (error) {
    // A failed notification must not break the guest conversation.
    console.error("[notify] failed", error);
  }
  return escalation;
}
