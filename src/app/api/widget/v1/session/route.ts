import { z } from "zod";
import { clientIp, json, widgetSecret } from "@/server/channels/widget-http";
import { prisma } from "@/server/db/client";
import { forOrg } from "@/server/db/tenant";
import { env } from "@/server/env";
import { isSameOriginRequest } from "@/server/security/origin";
import { getRateLimiter, WIDGET_LIMITS } from "@/server/security/rate-limit";
import {
  issueWidgetToken,
  newGuestSessionId,
  verifyWidgetToken,
} from "@/server/security/widget-token";
import {
  findWidgetConversation,
  getWidgetProperty,
  listGuestMessages,
} from "@/server/services/widget";

const body = z.object({ key: z.string().min(1).max(100), token: z.string().max(1024).nullish() });

/**
 * Starts (or resumes) an anonymous guest session for a property's widget.
 * Returns a signed session token and the session's message history.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad_request" }, { status: 400 });

  const property = await getWidgetProperty(prisma, parsed.data.key);
  if (!property) return json({ error: "unknown_key" }, { status: 404 });
  // Same-origin only (our iframe). Site whitelisting happens via frame-ancestors.
  if (!isSameOriginRequest(request.headers, env.APP_URL)) {
    return json({ error: "origin_not_allowed" }, { status: 403 });
  }
  const { limit, windowMs } = WIDGET_LIMITS.sessionPerIp;
  if (!(await getRateLimiter().take(`ws:ip:${clientIp(request)}`, limit, windowMs))) {
    return json({ error: "rate_limited" }, { status: 429 });
  }

  const secret = widgetSecret();
  const previous = verifyWidgetToken(parsed.data.token, secret);
  const sessionId = previous && previous.p === property.id ? previous.s : newGuestSessionId();
  const token = issueWidgetToken(
    { o: property.organizationId, p: property.id, s: sessionId },
    secret,
  );

  const db = forOrg(property.organizationId, prisma);
  const conversation = await findWidgetConversation(db, property.id, sessionId);
  const messages = conversation ? await listGuestMessages(db, conversation.id) : [];

  return json({
    token,
    property: { name: property.name, defaultLanguage: property.defaultLanguage },
    messages,
  });
}
