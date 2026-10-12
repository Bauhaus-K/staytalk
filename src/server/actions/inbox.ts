"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getLlmClient } from "@/server/agent/llm";
import { requireTenant } from "@/server/auth/session";
import {
  MAX_STAFF_MESSAGE_LENGTH,
  resolveConversation,
  returnToAi,
  sendStaffReply,
} from "@/server/services/staff";

export type InboxActionState = { ok?: boolean; error?: "generic" } | undefined;

const base = z.object({
  locale: z.enum(["ko", "ja", "en"]).catch("ko"),
  conversationId: z.string().min(1),
});

function revalidate(locale: string, conversationId: string) {
  revalidatePath(`/${locale}/inbox`);
  revalidatePath(`/${locale}/inbox/${conversationId}`);
}

export async function staffReplyAction(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const parsed = base
    .extend({ text: z.string().trim().min(1).max(MAX_STAFF_MESSAGE_LENGTH) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };
  const { locale, conversationId, text } = parsed.data;
  const { user, db } = await requireTenant(locale);
  try {
    await sendStaffReply(db, getLlmClient(), {
      organizationId: user.organizationId,
      conversationId,
      userId: user.id,
      text,
    });
  } catch (error) {
    console.error("[inbox] reply failed", error);
    return { error: "generic" };
  }
  revalidate(locale, conversationId);
  return { ok: true };
}

export async function conversationStatusAction(formData: FormData) {
  const parsed = base
    .extend({ action: z.enum(["resolve", "returnToAi"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { locale, conversationId, action } = parsed.data;
  const { user, db } = await requireTenant(locale);
  const input = { conversationId, userId: user.id };
  if (action === "resolve") await resolveConversation(db, input);
  else await returnToAi(db, input);
  revalidate(locale, conversationId);
}
