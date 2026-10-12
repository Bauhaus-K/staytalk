import { beforeAll, describe, expect, it } from "vitest";
import { MockLlmClient } from "@/server/agent/llm/mock";
import { forOrg } from "@/server/db/tenant";
import { MemoryNotifier } from "@/server/notifications";
import { createBookingRequest } from "@/server/services/booking";
import { handleGuestMessage } from "@/server/services/conversation";
import { MASKED, maskOldConversations } from "@/server/services/retention";
import { seedDemo } from "../prisma/seed/seed";
import { testDb } from "./db";

const client = testDb();
const ORG = "org_demo_seoul";
const db = forOrg(ORG, client);
let propertyId: string;

beforeAll(async () => {
  const [seoul] = await seedDemo(client);
  propertyId = seoul!.id;
});

describe("maskOldConversations", () => {
  it("masks old conversation content but keeps metadata; leaves recent ones", async () => {
    const deps = {
      client,
      llm: new MockLlmClient(),
      notifier: new MemoryNotifier(),
      maxToolCalls: 6,
      timeoutMs: 10_000,
    };
    const old = await handleGuestMessage(
      {
        organizationId: ORG,
        propertyId,
        channel: "WEB_WIDGET",
        guestSessionId: "old",
        text: "I'm Jane Doe, is there a sauna?",
      },
      deps,
    );
    const recent = await handleGuestMessage(
      {
        organizationId: ORG,
        propertyId,
        channel: "WEB_WIDGET",
        guestSessionId: "new",
        text: "Wi-Fi?",
      },
      deps,
    );
    const longAgo = new Date(Date.now() - 100 * 86_400_000);
    await db.conversation.update({
      where: { id: old.conversationId },
      data: { lastMessageAt: longAgo },
    });

    const result = await maskOldConversations(client);
    expect(result.conversations).toBeGreaterThanOrEqual(1);

    const messages = await db.message.findMany({ where: { conversationId: old.conversationId } });
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((m) => m.content === MASKED && m.translatedContent === null)).toBe(true);
    expect(messages.map((m) => m.role)).toContain("GUEST"); // metadata kept
    expect(
      JSON.stringify(
        await db.escalation.findMany({ where: { conversationId: old.conversationId } }),
      ),
    ).not.toContain("Jane");
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: old.conversationId } });
    expect(conv.maskedAt).not.toBeNull();
    expect(conv.guestSessionId).toBeNull();

    const kept = await db.message.findMany({ where: { conversationId: recent.conversationId } });
    expect(kept.some((m) => m.content === "Wi-Fi?")).toBe(true);

    // Idempotent: already-masked conversations are skipped.
    const again = await maskOldConversations(client);
    expect(again.conversations).toBe(0);
  });

  it("masks guest details on bookings whose checkout is past retention", async () => {
    const roomType = await db.roomType.findFirstOrThrow({
      where: { propertyId, capacity: { gte: 2 } },
    });
    const now = new Date();
    const { booking } = await createBookingRequest(
      db,
      new MemoryNotifier(),
      {
        organizationId: ORG,
        propertyId,
        conversationId: null,
        roomTypeId: roomType.id,
        checkIn: new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10),
        checkOut: new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10),
        guests: 2,
        guestName: "Jane Doe",
        guestContact: "jane@example.com",
        guestLanguage: "en",
      },
      now,
    );
    await maskOldConversations(client, new Date(now.getTime() + 95 * 86_400_000));
    const after = await db.bookingRequest.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after).toMatchObject({ guestName: MASKED, guestContact: MASKED });
  });
});
