import { createHmac, timingSafeEqual } from "node:crypto";
import type { ChannelAdapter, DeliveryTarget, InboundMessage } from "./types";

/** LINE Messaging API limits. */
const MAX_MESSAGES_PER_CALL = 5;
const MAX_TEXT_LENGTH = 5000;
const API_BASE = "https://api.line.me/v2/bot/message";

export type LineAdapterOptions = {
  channelSecret: string;
  accessToken: string;
  /** "mock" records outgoing calls instead of calling LINE (LINE_MODE=mock). */
  mode: "mock" | "live";
  fetch?: typeof fetch;
};

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

export type LineApiCall = { endpoint: "reply" | "push"; body: Record<string, unknown> };

export function lineSignature(body: string, channelSecret: string): string {
  return createHmac("sha256", channelSecret).update(body).digest("base64");
}

/** Splits replies into LINE text messages (≤5000 chars each). */
export function toLineMessages(texts: string[]): { type: "text"; text: string }[] {
  const out: { type: "text"; text: string }[] = [];
  for (const text of texts) {
    for (let i = 0; i < text.length; i += MAX_TEXT_LENGTH) {
      out.push({ type: "text", text: text.slice(i, i + MAX_TEXT_LENGTH) });
    }
  }
  return out;
}

/**
 * LINE Messaging API webhook adapter. Inbound: HMAC-SHA256 signature check on
 * the raw body (`x-line-signature`), text messages from 1:1 chats. Outbound:
 * reply API while the reply token is valid, push API otherwise.
 */
export class LineAdapter implements ChannelAdapter {
  readonly channel = "LINE" as const;
  /** Outgoing calls made in mock mode (for tests and local development). */
  readonly sent: LineApiCall[] = [];

  constructor(private readonly options: LineAdapterOptions) {}

  async verifySignature(request: Request): Promise<boolean> {
    const signature = request.headers.get("x-line-signature");
    if (!signature) return false;
    const body = await request.clone().text();
    const expected = Buffer.from(lineSignature(body, this.options.channelSecret));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async receive(request: Request): Promise<InboundMessage[]> {
    const payload = (await request.json().catch(() => null)) as { events?: LineEvent[] } | null;
    return (payload?.events ?? [])
      .filter(
        (e) =>
          e.type === "message" &&
          e.message?.type === "text" &&
          e.source?.type === "user" &&
          e.source.userId &&
          e.message.text?.trim(),
      )
      .map((e) => ({
        externalUserId: e.source!.userId!,
        text: e.message!.text!,
        replyToken: e.replyToken,
      }));
  }

  async send(target: DeliveryTarget, messages: { text: string }[]): Promise<void> {
    const lineMessages = toLineMessages(messages.map((m) => m.text));
    for (let i = 0; i < lineMessages.length; i += MAX_MESSAGES_PER_CALL) {
      const batch = lineMessages.slice(i, i + MAX_MESSAGES_PER_CALL);
      // A reply token is single-use: only the first batch can use it.
      if (i === 0 && target.replyToken) {
        const ok = await this.call("reply", { replyToken: target.replyToken, messages: batch });
        if (ok) continue;
      }
      if (!target.externalUserId) throw new Error("LINE push needs the user id");
      if (!(await this.call("push", { to: target.externalUserId, messages: batch }))) {
        throw new Error("LINE push failed");
      }
    }
  }

  private async call(endpoint: "reply" | "push", body: Record<string, unknown>): Promise<boolean> {
    if (this.options.mode === "mock") {
      this.sent.push({ endpoint, body });
      console.info(`[line:mock] ${endpoint}`, JSON.stringify(body).slice(0, 200));
      return true;
    }
    const response = await (this.options.fetch ?? fetch)(`${API_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.accessToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error(`[line] ${endpoint} failed: ${response.status}`);
      return false;
    }
    return true;
  }
}
