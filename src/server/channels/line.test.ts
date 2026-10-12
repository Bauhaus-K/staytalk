import { describe, expect, it, vi } from "vitest";
import { LineAdapter, lineSignature, toLineMessages } from "./line";

const SECRET = "line-channel-secret";

function webhook(body: unknown, signature?: string) {
  const raw = JSON.stringify(body);
  return new Request("http://x/api/webhooks/line/c1", {
    method: "POST",
    headers: {
      "x-line-signature": signature ?? lineSignature(raw, SECRET),
      "content-type": "application/json",
    },
    body: raw,
  });
}

const textEvent = (userId: string, text: string, replyToken = "rt-1") => ({
  type: "message",
  replyToken,
  source: { type: "user", userId },
  message: { type: "text", id: "m1", text },
});

describe("LineAdapter", () => {
  const adapter = () =>
    new LineAdapter({ channelSecret: SECRET, accessToken: "tok", mode: "mock" });

  it("verifies the HMAC-SHA256 signature of the raw body", async () => {
    const body = { destination: "U0", events: [textEvent("U1", "hi")] };
    expect(await adapter().verifySignature(webhook(body))).toBe(true);
    expect(await adapter().verifySignature(webhook(body, lineSignature("tampered", SECRET)))).toBe(
      false,
    );
    expect(
      await adapter().verifySignature(
        webhook(body, lineSignature(JSON.stringify(body), "other-secret")),
      ),
    ).toBe(false);
    const unsigned = new Request("http://x", { method: "POST", body: JSON.stringify(body) });
    expect(await adapter().verifySignature(unsigned)).toBe(false);
  });

  it("receives only 1:1 text messages", async () => {
    const body = {
      events: [
        textEvent("U1", "チェックインは何時ですか？"),
        { type: "follow", source: { type: "user", userId: "U2" }, replyToken: "rt-2" },
        { type: "message", source: { type: "user", userId: "U3" }, message: { type: "sticker" } },
        {
          type: "message",
          source: { type: "group", groupId: "G1" },
          message: { type: "text", text: "hi" },
        },
        textEvent("U4", "   "),
      ],
    };
    expect(await adapter().receive(webhook(body))).toEqual([
      { externalUserId: "U1", text: "チェックインは何時ですか？", replyToken: "rt-1" },
    ]);
  });

  it("replies with the token, batches 5 messages per call and pushes the rest", async () => {
    const a = adapter();
    await a.send(
      { conversationId: "c", externalUserId: "U1", replyToken: "rt" },
      Array.from({ length: 7 }, (_, i) => ({ text: `m${i}` })),
    );
    expect(a.sent.map((c) => c.endpoint)).toEqual(["reply", "push"]);
    expect((a.sent[0]!.body.messages as unknown[]).length).toBe(5);
    expect(a.sent[1]!.body).toMatchObject({ to: "U1" });
  });

  it("falls back to push when the reply token is rejected (live mode)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 400 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const a = new LineAdapter({
      channelSecret: SECRET,
      accessToken: "tok",
      mode: "live",
      fetch: fetchMock,
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await a.send({ conversationId: "c", externalUserId: "U1", replyToken: "expired" }, [
      { text: "hello" },
    ]);
    spy.mockRestore();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://api.line.me/v2/bot/message/reply",
      "https://api.line.me/v2/bot/message/push",
    ]);
    expect(fetchMock.mock.calls[1]![1].headers.authorization).toBe("Bearer tok");
  });

  it("splits texts longer than LINE's limit", () => {
    const parts = toLineMessages(["a".repeat(12_000)]);
    expect(parts.map((p) => p.text.length)).toEqual([5000, 5000, 2000]);
  });
});
