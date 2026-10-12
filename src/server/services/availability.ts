import type { PricingModel } from "@/generated/prisma/enums";
import type { TenantDb } from "@/server/db/tenant";
import { addDays, nightsBetween, parseIsoDate, todayIn, toIsoDate } from "@/lib/dates";

export const MAX_NIGHTS = 30;
/** How far ahead guests can ask (days). */
export const MAX_ADVANCE_DAYS = 365;

export type StayQuery = { checkIn: string; checkOut: string; guests: number };

export type QuoteRoomType = {
  id: string;
  name: unknown;
  capacity: number;
  pricingModel: PricingModel;
  baseRate: number;
  totalRooms: number;
};

export type NightOverride = {
  date: Date;
  availableCount: number | null;
  rate: number | null;
  closed: boolean;
};

export type RoomQuote = {
  roomTypeId: string;
  name: unknown;
  capacity: number;
  pricingModel: PricingModel;
  /** Rooms free on every night of the stay. */
  availableRooms: number;
  nights: { date: string; rate: number; available: number }[];
  total: number;
};

export type StayValidationError =
  | "invalid_date"
  | "check_out_before_check_in"
  | "too_many_nights"
  | "in_the_past"
  | "too_far_ahead"
  | "invalid_guests";

export type ValidatedStay = { checkIn: Date; checkOut: Date; nights: number; guests: number };

/** Validates a stay request against the property's local "today". */
export function validateStay(
  query: StayQuery,
  timezone: string,
  now = new Date(),
): { ok: true; stay: ValidatedStay } | { ok: false; error: StayValidationError } {
  const checkIn = parseIsoDate(query.checkIn);
  const checkOut = parseIsoDate(query.checkOut);
  if (!checkIn || !checkOut) return { ok: false, error: "invalid_date" };
  const nights = nightsBetween(checkIn, checkOut);
  if (nights <= 0) return { ok: false, error: "check_out_before_check_in" };
  if (nights > MAX_NIGHTS) return { ok: false, error: "too_many_nights" };
  const today = todayIn(timezone, now);
  if (checkIn < today) return { ok: false, error: "in_the_past" };
  if (nightsBetween(today, checkIn) > MAX_ADVANCE_DAYS)
    return { ok: false, error: "too_far_ahead" };
  if (!Number.isInteger(query.guests) || query.guests < 1 || query.guests > 20) {
    return { ok: false, error: "invalid_guests" };
  }
  return { ok: true, stay: { checkIn, checkOut, nights, guests: query.guests } };
}

/**
 * Pure availability/price computation for one room type.
 * Per night: available = (override count ?? total rooms) − approved bookings,
 * 0 when closed; rate = override rate ?? base rate, × guests for PER_PERSON.
 */
export function quoteRoomType(
  roomType: QuoteRoomType,
  stay: ValidatedStay,
  overrides: NightOverride[],
  bookedByNight: Map<string, number>,
): RoomQuote {
  const byDate = new Map(overrides.map((o) => [toIsoDate(o.date), o]));
  const nights: RoomQuote["nights"] = [];
  for (let i = 0; i < stay.nights; i++) {
    const date = toIsoDate(addDays(stay.checkIn, i));
    const o = byDate.get(date);
    const capacity = o?.closed ? 0 : (o?.availableCount ?? roomType.totalRooms);
    const available = Math.max(0, capacity - (bookedByNight.get(date) ?? 0));
    const nightly = o?.rate ?? roomType.baseRate;
    const rate = roomType.pricingModel === "PER_PERSON" ? nightly * stay.guests : nightly;
    nights.push({ date, rate, available });
  }
  return {
    roomTypeId: roomType.id,
    name: roomType.name,
    capacity: roomType.capacity,
    pricingModel: roomType.pricingModel,
    availableRooms: Math.min(...nights.map((n) => n.available)),
    nights,
    total: nights.reduce((sum, n) => sum + n.rate, 0),
  };
}

/** Approved bookings per night for a room type within [checkIn, checkOut). */
async function approvedNights(
  db: TenantDb,
  roomTypeIds: string[],
  stay: ValidatedStay,
  excludeBookingId?: string,
): Promise<Map<string, Map<string, number>>> {
  const bookings = await db.bookingRequest.findMany({
    where: {
      roomTypeId: { in: roomTypeIds },
      status: "APPROVED",
      checkIn: { lt: stay.checkOut },
      checkOut: { gt: stay.checkIn },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { roomTypeId: true, checkIn: true, checkOut: true },
  });
  const result = new Map<string, Map<string, number>>();
  for (const b of bookings) {
    const perNight = result.get(b.roomTypeId) ?? new Map<string, number>();
    for (let d = b.checkIn; d < b.checkOut; d = addDays(d, 1)) {
      if (d < stay.checkIn || d >= stay.checkOut) continue;
      const key = toIsoDate(d);
      perNight.set(key, (perNight.get(key) ?? 0) + 1);
    }
    result.set(b.roomTypeId, perNight);
  }
  return result;
}

/**
 * Quotes every active room type of a property that fits the party size.
 * PENDING requests do not hold inventory; approval re-checks availability.
 */
export async function quoteStay(
  db: TenantDb,
  propertyId: string,
  stay: ValidatedStay,
  options: { roomTypeId?: string; excludeBookingId?: string } = {},
): Promise<RoomQuote[]> {
  const roomTypes = await db.roomType.findMany({
    where: {
      propertyId,
      active: true,
      capacity: { gte: stay.guests },
      ...(options.roomTypeId ? { id: options.roomTypeId } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  if (!roomTypes.length) return [];
  const ids = roomTypes.map((r) => r.id);
  const [overrides, booked] = await Promise.all([
    db.availability.findMany({
      where: { roomTypeId: { in: ids }, date: { gte: stay.checkIn, lt: stay.checkOut } },
    }),
    approvedNights(db, ids, stay, options.excludeBookingId),
  ]);
  return roomTypes.map((rt) =>
    quoteRoomType(
      rt,
      stay,
      overrides.filter((o) => o.roomTypeId === rt.id),
      booked.get(rt.id) ?? new Map(),
    ),
  );
}
