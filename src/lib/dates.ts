/**
 * Stay dates are calendar dates (no time zone), stored as UTC midnight
 * (`@db.Date`). These helpers keep that convention in one place.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-11-20" → Date at UTC midnight, or null if invalid. */
export function parseIsoDate(value: string): Date | null {
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return toIsoDate(date) === value.trim() ? date : null;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Whole nights between two UTC-midnight dates. */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
}

/** Today's calendar date in a time zone, as UTC midnight. */
export function todayIn(timeZone: string, now = new Date()): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parseIsoDate(iso)!;
}

/**
 * The instant at which a calendar date (UTC-midnight convention) begins in a
 * time zone, e.g. 2026-10-12 in Asia/Seoul → 2026-10-11T15:00:00Z.
 */
export function localMidnightUtc(date: Date, timeZone: string): Date {
  const guess = date.getTime();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    +parts.year!,
    +parts.month! - 1,
    +parts.day!,
    +parts.hour!,
    +parts.minute!,
    +parts.second!,
  );
  return new Date(guess - (asUtc - guess));
}
