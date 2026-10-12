"use server";

import { z } from "zod";
import { requireTenant } from "@/server/auth/session";
import { handleGuestMessage, MAX_GUEST_MESSAGE_LENGTH } from "@/server/services/conversation";
import { conversationDeps } from "@/server/services/runtime";

const schema = z.object({
  locale: z.enum(["ko", "ja", "en"]).catch("ko"),
  propertyId: z.string().min(1),
  conversationId: z.string().min(1).nullable(),
  text: z.string().trim().min(1).max(MAX_GUEST_MESSAGE_LENGTH),
});

export type PlaygroundResult = { ok: true; conversationId: string } | { ok: false };

/** Sends a message as a test guest from the dashboard playground. */
export async function sendPlaygroundMessage(
  raw: z.input<typeof schema>,
): Promise<PlaygroundResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const { locale, propertyId, conversationId, text } = parsed.data;
  const { user, db } = await requireTenant(locale);

  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { id: true },
  });
  if (!property) return { ok: false };
  // Never write test messages into a real guest conversation.
  if (conversationId) {
    const existing = await db.conversation.findFirst({
      where: { id: conversationId, propertyId, isTest: true },
      select: { id: true },
    });
    if (!existing) return { ok: false };
  }

  try {
    const result = await handleGuestMessage(
      {
        organizationId: user.organizationId,
        propertyId,
        conversationId,
        channel: "WEB_WIDGET",
        guestSessionId: `playground:${user.id}`,
        text,
        isTest: true,
      },
      conversationDeps(),
    );
    return { ok: true, conversationId: result.conversationId };
  } catch (error) {
    console.error("[playground] failed", error);
    return { ok: false };
  }
}
