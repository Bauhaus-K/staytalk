import type { Channel } from "@/generated/prisma/enums";

/** A guest message parsed from a channel request. */
export type InboundMessage = {
  /** Anonymous session id (web widget). */
  guestSessionId?: string;
  /** Channel-native user id (LINE userId, ...). */
  externalUserId?: string;
  text: string;
  /** Short-lived reply handle for channels that have one (LINE). */
  replyToken?: string;
};

export type DeliveryTarget = {
  conversationId: string;
  guestSessionId?: string | null;
  externalUserId?: string | null;
  replyToken?: string;
};

/**
 * Common contract for guest channels (web widget, LINE, Kakao, email).
 * `verifySignature` authenticates the inbound request (HMAC signature for
 * webhooks, session token + origin for the widget); `receive` parses it;
 * `send` pushes outbound messages for push-style channels.
 */
export interface ChannelAdapter<Req = Request> {
  readonly channel: Channel;
  verifySignature(request: Req): Promise<boolean>;
  receive(request: Req): Promise<InboundMessage[]>;
  send(target: DeliveryTarget, messages: { text: string }[]): Promise<void>;
}
