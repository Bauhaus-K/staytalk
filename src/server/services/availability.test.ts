import { describe, expect, it } from "vitest";
import { parseIsoDate } from "@/lib/dates";
import { quoteRoomType, validateStay } from "./availability";

const now = new Date("2026-10-12T03:00:00Z"); // 12:00 in Seoul

describe("validateStay", () => {
  it("accepts a normal stay", () => {
    const r = validateStay(
      { checkIn: "2026-10-20", checkOut: "2026-10-22", guests: 2 },
      "Asia/Seoul",
      now,
    );
    expect(r).toMatchObject({ ok: true, stay: { nights: 2, guests: 2 } });
  });

  it.each([
    [{ checkIn: "2026-13-01", checkOut: "2026-13-02", guests: 1 }, "invalid_date"],
    [{ checkIn: "2026-10-22", checkOut: "2026-10-22", guests: 1 }, "check_out_before_check_in"],
    [{ checkIn: "2026-10-11", checkOut: "2026-10-13", guests: 1 }, "in_the_past"],
    [{ checkIn: "2026-10-20", checkOut: "2026-12-01", guests: 1 }, "too_many_nights"],
    [{ checkIn: "2028-01-01", checkOut: "2028-01-02", guests: 1 }, "too_far_ahead"],
    [{ checkIn: "2026-10-20", checkOut: "2026-10-21", guests: 0 }, "invalid_guests"],
  ])("%j → %s", (query, error) => {
    expect(validateStay(query, "Asia/Seoul", now)).toEqual({ ok: false, error });
  });

  it("uses the property's local date for 'today'", () => {
    // 23:30 UTC on Oct 11 is already Oct 12 in Tokyo.
    const late = new Date("2026-10-11T15:30:00Z");
    expect(
      validateStay({ checkIn: "2026-10-12", checkOut: "2026-10-13", guests: 1 }, "Asia/Tokyo", late)
        .ok,
    ).toBe(true);
  });
});

describe("quoteRoomType", () => {
  const stay = {
    checkIn: parseIsoDate("2026-10-20")!,
    checkOut: parseIsoDate("2026-10-23")!,
    nights: 3,
    guests: 2,
  };
  const room = { id: "r", name: {}, capacity: 2, baseRate: 100, totalRooms: 3 };

  it("applies overrides, closures and approved bookings per night", () => {
    const q = quoteRoomType(
      { ...room, pricingModel: "PER_ROOM" },
      stay,
      [
        { date: parseIsoDate("2026-10-21")!, availableCount: 2, rate: 150, closed: false },
        { date: parseIsoDate("2026-10-22")!, availableCount: null, rate: null, closed: false },
      ],
      new Map([["2026-10-21", 1]]),
    );
    expect(q.nights).toEqual([
      { date: "2026-10-20", rate: 100, available: 3 },
      { date: "2026-10-21", rate: 150, available: 1 },
      { date: "2026-10-22", rate: 100, available: 3 },
    ]);
    expect(q.availableRooms).toBe(1);
    expect(q.total).toBe(350);
  });

  it("closed nights make the room unavailable; per-person pricing multiplies by guests", () => {
    const q = quoteRoomType(
      { ...room, pricingModel: "PER_PERSON" },
      stay,
      [{ date: parseIsoDate("2026-10-22")!, availableCount: null, rate: null, closed: true }],
      new Map(),
    );
    expect(q.availableRooms).toBe(0);
    expect(q.total).toBe(600);
  });
});
