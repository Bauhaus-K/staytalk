import { z } from "zod";
import type { DbClient } from "@/server/db/client";
import { isSameOriginRequest } from "@/server/security/origin";
import { verifyWidgetToken, type WidgetTokenPayload } from "@/server/security/widget-token";
import { getWidgetPropertyById, type WidgetProperty } from "@/server/services/widget";
import type { ChannelAdapter, InboundMessage } from "./types";

const messageBody = z.object({ text: z.string().trim().min(1).max(2000) });

export type WidgetAuth = { payload: WidgetTokenPayload; property: WidgetProperty };

/**
 * Web widget channel. Guests pull new messages by polling, so `send` has
 * nothing to push. Authentication = signed session token + app Origin.
 */
export class WebWidgetAdapter implements ChannelAdapter {
  readonly channel = "WEB_WIDGET" as const;

  constructor(
    private readonly client: DbClient,
    private readonly secret: string,
    private readonly appOrigin: string,
  ) {}

  /** Resolves token + origin to the guest session, or null if not allowed. */
  async authenticate(request: Request): Promise<WidgetAuth | null> {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const payload = verifyWidgetToken(token, this.secret);
    if (!payload) return null;
    const property = await getWidgetPropertyById(this.client, payload.p);
    if (!property || property.organizationId !== payload.o) return null;
    // The API is only called from our own iframe; which sites may embed that
    // iframe is enforced separately via CSP frame-ancestors.
    if (!isSameOriginRequest(request.headers, this.appOrigin)) {
      return null;
    }
    return { payload, property };
  }

  async verifySignature(request: Request): Promise<boolean> {
    return (await this.authenticate(request)) !== null;
  }

  async receive(request: Request): Promise<InboundMessage[]> {
    const auth = await this.authenticate(request);
    if (!auth) return [];
    const parsed = messageBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return [];
    return [{ guestSessionId: auth.payload.s, text: parsed.data.text }];
  }

  async send(): Promise<void> {
    // Pull-based: the widget polls /api/widget/v1/messages.
  }
}
