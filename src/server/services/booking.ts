import type { DbClient } from "@/server/db/client";
import { forOrg, type TenantDb } from "@/server/db/tenant";
import type { LlmClient } from "@/server/agent/llm/types";
import { deliverToGuest } from "@/server/channels/registry";
import { toIsoDate } from "@/lib/dates";
import {
  BOOKING_STRINGS,
  bookingReference,
  formatMoney,
  localizedName,
  type BookingDetails,
  type DeclineReason,
} from "@/server/language/booking-strings";
import { isGuestLanguage, type GuestLanguage } from "@/server/language/codes";
import { translateText } from "@/server/language/translate";
import type { Notifier } from "@/server/notifications";
import { quoteStay, validateStay, type StayQuery } from "./availability";
import { trackUsage } from "./usage";

export class BookingError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

type BookingWithRoom = Awaited<ReturnType<typeof loadBooking>>;

function loadBooking(db: TenantDb, id: string) {
  return db.bookingRequest.findUnique({
    where: { id },
    include: {
      roomType: { select: { name: true } },
      property: { select: { name: true, timezone: true, currency: true } },
      conversation: {
        select: { id: true, channel: true, guestSessionId: true, externalUserId: true },
      },
    },
  });
}

function details(booking: NonNullable<BookingWithRoom>, language: GuestLanguage): BookingDetails {
  return {
    reference: bookingReference(booking.id),
    roomName: localizedName(booking.roomType.name, language),
    checkIn: toIsoDate(booking.checkIn),
    checkOut: toIsoDate(booking.checkOut),
    guests: booking.guests,
    total:
      booking.quotedTotal != null
        ? formatMoney(booking.quotedTotal, booking.currency, language)
        : null,
  };
}

/** Posts a fixed outcome message into the booking's conversation (if any). */
async function notifyGuest(
  db: TenantDb,
  booking: NonNullable<BookingWithRoom>,
  text: string,
  now: Date,
) {
  if (!booking.conversation) return;
  await db.message.create({
    data: {
      organizationId: booking.organizationId,
      conversationId: booking.conversation.id,
      role: "SYSTEM",
      content: text,
      language: booking.guestLanguage,
    },
  });
  await db.conversation.update({
    where: { id: booking.conversation.id },
    data: { lastMessageAt: now },
  });
  await deliverToGuest(
    booking.conversation.channel,
    {
      conversationId: booking.conversation.id,
      guestSessionId: booking.conversation.guestSessionId,
      externalUserId: booking.conversation.externalUserId,
    },
    [{ text }],
  );
}

function guestLanguageOf(booking: { guestLanguage: string }): GuestLanguage {
  return isGuestLanguage(booking.guestLanguage) ? booking.guestLanguage : "en";
}

export type CreateBookingInput = StayQuery & {
  organizationId: string;
  propertyId: string;
  conversationId: string | null;
  roomTypeId: string;
  guestName: string;
  guestContact: string;
  guestLanguage: GuestLanguage;
  note?: string | null;
};

/**
 * Creates a PENDING booking request. Requires current availability (so the
 * guest isn't sent a request that's certain to fail) but does not hold
 * inventory: staff approval re-checks.
 */
export async function createBookingRequest(
  db: TenantDb,
  notifier: Notifier,
  input: CreateBookingInput,
  now = new Date(),
) {
  const property = await db.property.findUnique({
    where: { id: input.propertyId },
    select: { id: true, name: true, timezone: true, currency: true, bookingRequestTtlHours: true },
  });
  if (!property) throw new BookingError("property_not_found");

  const validation = validateStay(input, property.timezone, now);
  if (!validation.ok) throw new BookingError(validation.error);
  const [quote] = await quoteStay(db, property.id, validation.stay, {
    roomTypeId: input.roomTypeId,
  });
  if (!quote) throw new BookingError("room_type_not_available_for_party");
  if (quote.availableRooms < 1) throw new BookingError("no_availability");

  const booking = await db.bookingRequest.create({
    data: {
      organizationId: input.organizationId,
      propertyId: property.id,
      conversationId: input.conversationId,
      roomTypeId: quote.roomTypeId,
      checkIn: validation.stay.checkIn,
      checkOut: validation.stay.checkOut,
      guests: validation.stay.guests,
      guestName: input.guestName,
      guestContact: input.guestContact,
      guestLanguage: input.guestLanguage,
      quotedTotal: quote.total,
      currency: property.currency,
      note: input.note ?? null,
      expiresAt: new Date(now.getTime() + property.bookingRequestTtlHours * 3_600_000),
    },
  });

  try {
    await notifier.bookingRequested({
      organizationId: input.organizationId,
      propertyId: property.id,
      propertyName: property.name,
      conversationId: input.conversationId,
      bookingRequestId: booking.id,
      reference: bookingReference(booking.id),
      roomName: localizedName(quote.name, "en"),
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guests: validation.stay.guests,
    });
  } catch (error) {
    console.error("[notify] booking notification failed", error);
  }
  return { booking, quote };
}

/**
 * Staff approval (the only path to APPROVED). Re-checks availability against
 * other approved bookings, then tells the guest in their language.
 */
export async function approveBooking(
  db: TenantDb,
  input: { bookingId: string; userId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const booking = await loadBooking(db, input.bookingId);
  if (!booking) throw new BookingError("not_found");
  if (booking.status !== "PENDING") throw new BookingError("not_pending");

  const stay = {
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    nights: Math.round((booking.checkOut.getTime() - booking.checkIn.getTime()) / 86_400_000),
    guests: booking.guests,
  };
  const [quote] = await quoteStay(db, booking.propertyId, stay, {
    roomTypeId: booking.roomTypeId,
    excludeBookingId: booking.id,
  });
  if (!quote || quote.availableRooms < 1) throw new BookingError("no_availability");

  // Guard against a concurrent decision: only flip a still-PENDING row.
  const updated = await db.bookingRequest.updateMany({
    where: { id: booking.id, status: "PENDING" },
    data: { status: "APPROVED", decidedById: input.userId, decidedAt: now },
  });
  if (updated.count === 0) throw new BookingError("not_pending");

  const language = guestLanguageOf(booking);
  await notifyGuest(
    db,
    booking,
    BOOKING_STRINGS[language].approved(details(booking, language)),
    now,
  );
}

export async function declineBooking(
  db: TenantDb,
  llm: LlmClient,
  input: {
    bookingId: string;
    userId: string;
    reason: DeclineReason;
    note?: string | null;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const booking = await loadBooking(db, input.bookingId);
  if (!booking) throw new BookingError("not_found");
  if (booking.status !== "PENDING") throw new BookingError("not_pending");

  const note = input.note?.trim() || null;
  const updated = await db.bookingRequest.updateMany({
    where: { id: booking.id, status: "PENDING" },
    data: {
      status: "DECLINED",
      declineReason: input.reason,
      declineNote: note,
      decidedById: input.userId,
      decidedAt: now,
    },
  });
  if (updated.count === 0) throw new BookingError("not_pending");

  const language = guestLanguageOf(booking);
  const strings = BOOKING_STRINGS[language];
  let text = strings.declined(details(booking, language), input.reason);
  if (note) {
    const tracked = trackUsage(llm, {
      db,
      organizationId: booking.organizationId,
      propertyId: booking.propertyId,
      conversationId: booking.conversation?.id ?? null,
    });
    const translated = await translateText(tracked, note, null, language);
    text += `\n\n${strings.staffNote}: ${translated?.text ?? note}`;
  }
  await notifyGuest(db, booking, text, now);
}

/**
 * Batch: expires PENDING requests past their deadline across all tenants and
 * tells each guest. Cross-tenant read via the unscoped client (batch job),
 * writes via each tenant's scoped client.
 */
export async function expirePendingBookings(client: DbClient, now = new Date()) {
  const due = await client.bookingRequest.findMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    select: { id: true, organizationId: true },
    take: 500,
  });
  let expired = 0;
  for (const row of due) {
    const db = forOrg(row.organizationId, client);
    const updated = await db.bookingRequest.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: { status: "EXPIRED", decidedAt: now },
    });
    if (updated.count === 0) continue;
    expired++;
    const booking = await loadBooking(db, row.id);
    if (!booking) continue;
    const language = guestLanguageOf(booking);
    await notifyGuest(
      db,
      booking,
      BOOKING_STRINGS[language].expired(details(booking, language)),
      now,
    );
  }
  return { expired };
}

/** Guest-visible status of the booking requests in one conversation. */
export async function bookingStatusForConversation(db: TenantDb, conversationId: string) {
  const rows = await db.bookingRequest.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { roomType: { select: { name: true } } },
  });
  return rows.map((b) => ({
    reference: bookingReference(b.id),
    status: b.status,
    roomType: b.roomType.name,
    checkIn: toIsoDate(b.checkIn),
    checkOut: toIsoDate(b.checkOut),
    guests: b.guests,
    expiresAt: b.status === "PENDING" ? b.expiresAt.toISOString() : null,
  }));
}
