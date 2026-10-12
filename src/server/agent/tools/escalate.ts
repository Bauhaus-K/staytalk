import { z } from "zod";
import { escalateConversation } from "@/server/services/escalation";
import { defineTool } from "./types";

export const ESCALATION_REASONS = [
  "UNKNOWN_ANSWER",
  "COMPLAINT",
  "REFUND",
  "EMERGENCY",
  "GUEST_REQUESTED_HUMAN",
  "BOOKING_CHANGE",
] as const;

export const escalateTool = defineTool({
  name: "escalate_to_human",
  description:
    "Hand the conversation over to the property's staff. Use when the answer is not in the knowledge base or tool " +
    "results (UNKNOWN_ANSWER), for complaints (COMPLAINT), refund/compensation/cancellation-fee requests (REFUND), " +
    "emergencies (EMERGENCY), when the guest asks for a person (GUEST_REQUESTED_HUMAN), or for booking requests, changes " +
    "and cancellations (BOOKING_CHANGE). After calling it, tell the guest briefly that staff will follow up. Call it at " +
    "most once per conversation turn.",
  schema: z.object({
    reason: z.enum(ESCALATION_REASONS),
    summary: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .describe(
        "1-2 sentences for staff, written in the staff language given in the property block",
      ),
  }),
  async run(input, ctx) {
    if (ctx.state.escalation) {
      return { ok: true, alreadyEscalated: true };
    }
    const escalation = await escalateConversation(ctx, {
      reason: input.reason,
      summary: input.summary,
    });
    return { ok: true, escalationId: escalation.id };
  },
});
