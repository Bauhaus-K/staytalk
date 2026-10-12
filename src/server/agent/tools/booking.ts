import { z } from "zod";
import { bookingReference, localizedName } from "@/server/language/booking-strings";
import { quoteStay, validateStay } from "@/server/services/availability";
import {
  BookingError,
  bookingStatusForConversation,
  createBookingRequest,
} from "@/server/services/booking";
import { defineTool } from "./types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const checkAvailabilityTool = defineTool({
  name: "check_availability",
  description:
    "Check which room types are available for a stay and their estimated total price. Dates are YYYY-MM-DD in the " +
    "property's local calendar; resolve relative dates ('next Friday') using property_local_time. Prices are estimates " +
    "for the whole stay in the property currency and are not a confirmation.",
  schema: z.object({
    check_in: isoDate.describe("Arrival date, YYYY-MM-DD"),
    check_out: isoDate.describe("Departure date, YYYY-MM-DD (after check_in)"),
    guests: z.number().int().min(1).max(20).describe("Number of guests in one room"),
  }),
  async run(input, ctx) {
    const validation = validateStay(
      { checkIn: input.check_in, checkOut: input.check_out, guests: input.guests },
      ctx.property.timezone,
      ctx.now,
    );
    if (!validation.ok) return { ok: false, error: validation.error };
    const quotes = await quoteStay(ctx.db, ctx.property.id, validation.stay);
    const currency = (
      await ctx.db.property.findUnique({
        where: { id: ctx.property.id },
        select: { currency: true },
      })
    )?.currency;
    return {
      ok: true,
      nights: validation.stay.nights,
      guests: validation.stay.guests,
      currency,
      room_types: quotes.map((q) => ({
        room_type_id: q.roomTypeId,
        name: q.name,
        capacity: q.capacity,
        pricing: q.pricingModel === "PER_PERSON" ? "per person per night" : "per room per night",
        available: q.availableRooms > 0,
        estimated_total: q.availableRooms > 0 ? q.total : null,
      })),
      note: quotes.length
        ? "Estimates only. Booking requests are confirmed by the property."
        : "No room type fits this number of guests.",
    };
  },
});

export const createBookingRequestTool = defineTool({
  name: "create_booking_request",
  description:
    "Submit a booking REQUEST for staff approval (status PENDING). Only call after check_availability showed the room " +
    "type available AND the guest explicitly asked to book and gave their name and a contact (email or phone). " +
    "Confirm the details with the guest first. Afterwards tell the guest the request was received and the property " +
    "will confirm it; never say the booking is confirmed.",
  schema: z.object({
    room_type_id: z.string().min(1),
    check_in: isoDate,
    check_out: isoDate,
    guests: z.number().int().min(1).max(20),
    guest_name: z.string().trim().min(1).max(100),
    guest_contact: z.string().trim().min(3).max(200).describe("Email address or phone number"),
    note: z.string().trim().max(500).optional().describe("Special requests, if any"),
  }),
  redactInput(input) {
    const value = input as Record<string, unknown>;
    return { ...value, guest_name: "[REDACTED]", guest_contact: "[REDACTED]" };
  },
  async run(input, ctx) {
    try {
      const { booking, quote } = await createBookingRequest(
        ctx.db,
        ctx.notifier,
        {
          organizationId: ctx.organizationId,
          propertyId: ctx.property.id,
          conversationId: ctx.conversationId,
          roomTypeId: input.room_type_id,
          checkIn: input.check_in,
          checkOut: input.check_out,
          guests: input.guests,
          guestName: input.guest_name,
          guestContact: input.guest_contact,
          guestLanguage: ctx.guestLanguage,
          note: input.note,
        },
        ctx.now,
      );
      ctx.state.bookingRequestIds = [...(ctx.state.bookingRequestIds ?? []), booking.id];
      return {
        ok: true,
        status: "PENDING",
        reference: bookingReference(booking.id),
        room_type: localizedName(quote.name, ctx.guestLanguage),
        estimated_total: quote.total,
        currency: booking.currency,
        expires_in_hours: Math.round((booking.expiresAt.getTime() - ctx.now.getTime()) / 3_600_000),
      };
    } catch (error) {
      if (error instanceof BookingError) return { ok: false, error: error.code };
      throw error;
    }
  },
});

export const getBookingRequestStatusTool = defineTool({
  name: "get_booking_request_status",
  description:
    "Look up the status (PENDING, APPROVED, DECLINED, EXPIRED) of booking requests made in this conversation.",
  schema: z.object({}),
  async run(_input, ctx) {
    return { requests: await bookingStatusForConversation(ctx.db, ctx.conversationId) };
  },
});
