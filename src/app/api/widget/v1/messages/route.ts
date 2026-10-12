import { clientIp, json, widgetAdapter } from "@/server/channels/widget-http";
import { prisma } from "@/server/db/client";
import { forOrg } from "@/server/db/tenant";
import { getRateLimiter, WIDGET_LIMITS } from "@/server/security/rate-limit";
import { handleGuestMessage } from "@/server/services/conversation";
import { conversationDeps } from "@/server/services/runtime";
import { findWidgetConversation, listGuestMessages } from "@/server/services/widget";

/** Polling endpoint: the guest session's messages (staff replies arrive here). */
export async function GET(request: Request) {
  const auth = await widgetAdapter().authenticate(request);
  if (!auth) return json({ error: "unauthorized" }, { status: 401 });
  const { limit, windowMs } = WIDGET_LIMITS.pollPerSession;
  if (!(await getRateLimiter().take(`wp:s:${auth.payload.s}`, limit, windowMs))) {
    return json({ error: "rate_limited" }, { status: 429 });
  }
  const db = forOrg(auth.property.organizationId, prisma);
  const conversation = await findWidgetConversation(db, auth.property.id, auth.payload.s);
  const messages = conversation ? await listGuestMessages(db, conversation.id) : [];
  return json({ messages });
}

/** Guest sends a message; responds with the updated thread (including AI replies). */
export async function POST(request: Request) {
  const adapter = widgetAdapter();
  const auth = await adapter.authenticate(request.clone());
  if (!auth) return json({ error: "unauthorized" }, { status: 401 });

  const limiter = getRateLimiter();
  const perSession = WIDGET_LIMITS.messagesPerSession;
  const perIp = WIDGET_LIMITS.messagesPerIp;
  const allowed =
    (await limiter.take(`wm:s:${auth.payload.s}`, perSession.limit, perSession.windowMs)) &&
    (await limiter.take(`wm:ip:${clientIp(request)}`, perIp.limit, perIp.windowMs));
  if (!allowed) return json({ error: "rate_limited" }, { status: 429 });

  const [inbound] = await adapter.receive(request);
  if (!inbound) return json({ error: "bad_request" }, { status: 400 });

  const db = forOrg(auth.property.organizationId, prisma);
  const existing = await findWidgetConversation(db, auth.property.id, auth.payload.s);
  const result = await handleGuestMessage(
    {
      organizationId: auth.property.organizationId,
      propertyId: auth.property.id,
      conversationId: existing?.id ?? null,
      channel: "WEB_WIDGET",
      guestSessionId: auth.payload.s,
      text: inbound.text,
    },
    conversationDeps(),
  );
  const messages = await listGuestMessages(db, result.conversationId);
  return json({ messages });
}

// The agent may run for up to AI_TIMEOUT_MS (default 30s) plus translations.
export const maxDuration = 60;
