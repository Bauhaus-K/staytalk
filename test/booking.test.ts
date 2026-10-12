import { beforeAll, describe, expect, it } from "vitest";
import { MockLlmClient } from "@/server/agent/llm/mock";
import { forOrg } from "@/server/db/tenant";
import { MemoryNotifier } from "@/server/notifications";
import { EMAIL_MASK } from "@/server/privacy/contact";
import { quoteStay, validateStay } from "@/server/services/availability";
import {
  approveBooking,
  BookingError,
  createBookingRequest,
  declineBooking,
  expirePendingBookings,
} from "@/server/services/booking";
import { handleGuestMessage, type ConversationDeps } from "@/server/services/conversation";
import { listGuestMessages } from "@/server/services/widget";
import { seedDemo } from "../prisma/seed/seed";
import { testDb } from "./db";

const client = testDb();
const ORG = "org_demo_fukuoka";
const db = forOrg(ORG, client);
const llm = new MockLlmClient();
const now = new Date("2026-10-12T03:00:00Z");
let propertyId: string;
let ownerId: string;
let rotenburo: { id: string; totalRooms: number };
let notifier: MemoryNotifier;

beforeAll(async () => {
  const [, fukuoka] = await seedDemo(client);
  propertyId = fukuoka!.id;
  ownerId = (await db.user.findFirstOrThrow({ where: { role: "OWNER" } })).id;
  const rt = await db.roomType.findFirstOrThrow({
    where: { propertyId, capacity: 2, baseRate: 32000 },
  });
  rotenburo = { id: rt.id, totalRooms: rt.totalRooms };
  notifier = new MemoryNotifier();
});

function request(
  checkIn: string,
  checkOut: string,
  extra: Partial<Parameters<typeof createBookingRequest>[2]> = {},
) {
  return createBookingRequest(
    db,
    notifier,
    {
      organizationId: ORG,
      propertyId,
      conversationId: null,
      roomTypeId: rotenburo.id,
      checkIn,
      checkOut,
      guests: 2,
      guestName: "Test Guest",
      guestContact: "guest@example.com",
      guestLanguage: "en",
      ...extra,
    },
    now,
  );
}

describe("booking requests", () => {
  it("creates a PENDING request with a per-person quote, expiry and staff notification", async () => {
    const { booking } = await request("2026-12-01", "2026-12-03");
    expect(booking.status).toBe("PENDING");
    expect(booking.quotedTotal).toBe(32000 * 2 * 2);
    expect(booking.currency).toBe("JPY");
    expect(booking.expiresAt.getTime() - now.getTime()).toBe(24 * 3_600_000);
    expect(notifier.bookings.at(-1)).toMatchObject({ bookingRequestId: booking.id, guests: 2 });
  });

  it("pending requests don't hold inventory; approval does and is re-checked", async () => {
    const requests = [];
    for (let i = 0; i < rotenburo.totalRooms + 1; i++) {
      requests.push((await request("2026-12-10", "2026-12-11")).booking);
    }
    for (let i = 0; i < rotenburo.totalRooms; i++) {
      await approveBooking(db, { bookingId: requests[i]!.id, userId: ownerId, now });
    }
    // Now full: the extra request cannot be approved, and new requests are refused.
    await expect(
      approveBooking(db, { bookingId: requests.at(-1)!.id, userId: ownerId, now }),
    ).rejects.toThrow(BookingError);
    await expect(request("2026-12-10", "2026-12-12")).rejects.toThrow("no_availability");

    const v = validateStay(
      { checkIn: "2026-12-10", checkOut: "2026-12-11", guests: 2 },
      "Asia/Tokyo",
      now,
    );
    const [q] = await quoteStay(db, propertyId, v.ok ? v.stay : (null as never), {
      roomTypeId: rotenburo.id,
    });
    expect(q!.availableRooms).toBe(0);
  });

  it("cannot decide a request twice", async () => {
    const { booking } = await request("2026-12-15", "2026-12-16");
    await approveBooking(db, { bookingId: booking.id, userId: ownerId, now });
    await expect(
      approveBooking(db, { bookingId: booking.id, userId: ownerId, now }),
    ).rejects.toThrow("not_pending");
    await expect(
      declineBooking(db, llm, { bookingId: booking.id, userId: ownerId, reason: "OTHER", now }),
    ).rejects.toThrow("not_pending");
  });

  it("expires overdue requests across tenants", async () => {
    const { booking } = await request("2026-12-20", "2026-12-21");
    const result = await expirePendingBookings(client, new Date(now.getTime() + 25 * 3_600_000));
    expect(result.expired).toBeGreaterThanOrEqual(1);
    const after = await db.bookingRequest.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("EXPIRED");
  });

  it("rejects room types from another tenant", async () => {
    const seoulRoom = await forOrg("org_demo_seoul", client).roomType.findFirstOrThrow();
    await expect(request("2026-12-01", "2026-12-02", { roomTypeId: seoulRoom.id })).rejects.toThrow(
      "room_type_not_available_for_party",
    );
  });
});

describe("booking through the agent (mock AI)", () => {
  it("availability → request with contact → approval message, without storing contact in the log", async () => {
    const deps: ConversationDeps = {
      client,
      llm,
      notifier,
      maxToolCalls: 6,
      timeoutMs: 10_000,
      now: () => now,
    };
    const send = (text: string, conversationId?: string) =>
      handleGuestMessage(
        {
          organizationId: ORG,
          propertyId,
          conversationId,
          channel: "WEB_WIDGET",
          guestSessionId: "book",
          text,
        },
        deps,
      );

    const first = await send("Do you have a room for 2 adults on November 5, one night?");
    expect(first.replies[0]!.content).toMatch(/Available rooms/);
    const second = await send(
      "Great, please book the 6-tatami room. My name is Alex Kim, email alex@example.com.",
      first.conversationId,
    );
    expect(second.replies[0]!.content).toMatch(/booking request has been received/);

    const booking = await db.bookingRequest.findFirstOrThrow({
      where: { conversationId: first.conversationId },
    });
    expect(booking).toMatchObject({
      guestName: "Alex Kim",
      guestContact: "alex@example.com",
      status: "PENDING",
    });

    // Contact details live only in BookingRequest: not in messages nor tool logs.
    const messages = await db.message.findMany({ where: { conversationId: first.conversationId } });
    expect(JSON.stringify(messages)).not.toContain("alex@example.com");
    expect(messages.find((m) => m.role === "GUEST" && m.content.includes(EMAIL_MASK))).toBeTruthy();
    const calls = await db.toolCall.findMany({
      where: { agentRun: { conversationId: first.conversationId } },
    });
    expect(JSON.stringify(calls)).not.toContain("alex@example.com");
    expect(JSON.stringify(calls)).not.toContain("Alex Kim");

    await approveBooking(db, { bookingId: booking.id, userId: ownerId, now });
    const visible = await listGuestMessages(db, first.conversationId);
    expect(visible.at(-1)!.text).toContain("Your booking is confirmed");
    expect(visible.at(-1)!.text).toContain(booking.id.slice(-6).toUpperCase());

    const status = await send("What's the status of my booking request?", first.conversationId);
    expect(status.replies[0]!.content).toContain("APPROVED");
  });

  it("declines are explained in the guest's language with a translated staff note", async () => {
    const { booking } = await request("2026-12-24", "2026-12-25", { guestLanguage: "ko" });
    const conv = await db.conversation.create({
      data: { organizationId: ORG, propertyId, channel: "WEB_WIDGET", guestLanguage: "ko" },
    });
    await db.bookingRequest.update({
      where: { id: booking.id },
      data: { conversationId: conv.id },
    });
    await declineBooking(db, llm, {
      bookingId: booking.id,
      userId: ownerId,
      reason: "FULLY_BOOKED",
      note: "別の日程でしたらご案内できます。",
      now,
    });
    const visible = await listGuestMessages(db, conv.id);
    expect(visible.at(-1)!.text).toContain("객실이 모두 찼습니다");
    expect(visible.at(-1)!.text).toContain("담당자 메모: [ko] 別の日程");
  });
});
