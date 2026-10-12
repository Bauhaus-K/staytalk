"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getLlmClient } from "@/server/agent/llm";
import { requireTenant } from "@/server/auth/session";
import { DECLINE_REASONS } from "@/server/language/booking-strings";
import { approveBooking, BookingError, declineBooking } from "@/server/services/booking";

export type BookingActionState =
  { ok?: boolean; error?: "no_availability" | "not_pending" | "generic" } | undefined;

const schema = z.object({
  locale: z.enum(["ko", "ja", "en"]).catch("ko"),
  bookingId: z.string().min(1),
  intent: z.enum(["approve", "decline"]),
  reason: z.enum(DECLINE_REASONS).optional(),
  note: z.string().max(1000).optional(),
});

/** Staff decision on a booking request (the only path to APPROVED). */
export async function decideBooking(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };
  const { locale, bookingId, intent, reason, note } = parsed.data;
  const { user, db } = await requireTenant(locale);
  try {
    if (intent === "approve") {
      await approveBooking(db, { bookingId, userId: user.id });
    } else {
      await declineBooking(db, getLlmClient(), {
        bookingId,
        userId: user.id,
        reason: reason ?? "OTHER",
        note,
      });
    }
  } catch (error) {
    if (
      error instanceof BookingError &&
      (error.code === "no_availability" || error.code === "not_pending")
    ) {
      return { error: error.code };
    }
    console.error("[bookings] decision failed", error);
    return { error: "generic" };
  }
  revalidatePath(`/${locale}/bookings`);
  return { ok: true };
}
