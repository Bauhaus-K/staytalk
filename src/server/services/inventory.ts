import { z } from "zod";
import type { TenantDb } from "@/server/db/tenant";
import { parseCsv } from "@/lib/csv";
import { parseIsoDate, toIsoDate } from "@/lib/dates";

export const MAX_CSV_ROWS = 2000;

export const roomTypeInputSchema = z.object({
  propertyId: z.string().min(1),
  nameKo: z.string().trim().max(100).default(""),
  nameJa: z.string().trim().max(100).default(""),
  nameEn: z.string().trim().max(100).default(""),
  capacity: z.coerce.number().int().min(1).max(20),
  pricingModel: z.enum(["PER_ROOM", "PER_PERSON"]),
  baseRate: z.coerce.number().int().min(0).max(100_000_000),
  totalRooms: z.coerce.number().int().min(0).max(500),
  active: z.boolean(),
});
export type RoomTypeInput = z.infer<typeof roomTypeInputSchema>;

/** Localized name JSON from the form (at least one language required). */
export function roomTypeName(input: RoomTypeInput): Record<string, string> | null {
  const name = Object.fromEntries(
    [
      ["ko", input.nameKo],
      ["ja", input.nameJa],
      ["en", input.nameEn],
    ].filter(([, v]) => v),
  );
  return Object.keys(name).length ? name : null;
}

export type InventoryRow = {
  line: number;
  roomTypeId: string;
  date: string;
  availableCount: number | null;
  rate: number | null;
  closed: boolean;
};

export type CsvErrorCode =
  | "missing_header"
  | "too_many_rows"
  | "unknown_room_type"
  | "invalid_date"
  | "invalid_available"
  | "available_exceeds_total"
  | "invalid_rate"
  | "invalid_closed";

export type CsvError = { line: number; code: CsvErrorCode; value?: string };

type RoomTypeRef = { id: string; name: unknown; totalRooms: number };

const REQUIRED = ["date", "room_type"] as const;

function parseOptionalInt(value: string): number | null | undefined {
  const v = value.trim().replace(/,/g, "");
  if (v === "") return null;
  if (!/^\d+$/.test(v)) return undefined;
  return Number(v);
}

function parseBool(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (["", "0", "false", "no", "n"].includes(v)) return false;
  if (["1", "true", "yes", "y", "closed"].includes(v)) return true;
  return undefined;
}

/**
 * Parses an inventory CSV (`date,room_type,available,rate,closed`).
 * `room_type` matches a room type id or any of its localized names; empty
 * `available`/`rate` mean "use the room type default".
 */
export function parseInventoryCsv(text: string, roomTypes: RoomTypeRef[]) {
  const rows = parseCsv(text);
  const errors: CsvError[] = [];
  const parsed: InventoryRow[] = [];
  if (!rows.length) return { rows: parsed, errors: [{ line: 1, code: "missing_header" as const }] };

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  if (!REQUIRED.every((h) => header.includes(h))) {
    return { rows: parsed, errors: [{ line: 1, code: "missing_header" as const }] };
  }
  if (rows.length - 1 > MAX_CSV_ROWS) {
    return { rows: parsed, errors: [{ line: MAX_CSV_ROWS + 2, code: "too_many_rows" as const }] };
  }
  const col = (name: string) => header.indexOf(name);

  const byKey = new Map<string, RoomTypeRef>();
  for (const rt of roomTypes) {
    byKey.set(rt.id.toLowerCase(), rt);
    if (rt.name && typeof rt.name === "object") {
      for (const n of Object.values(rt.name as Record<string, string>))
        byKey.set(n.trim().toLowerCase(), rt);
    }
  }

  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "") : "");
    const before = errors.length;

    const roomType = byKey.get(get("room_type").trim().toLowerCase());
    if (!roomType) errors.push({ line, code: "unknown_room_type", value: get("room_type") });
    const date = parseIsoDate(get("date"));
    if (!date) errors.push({ line, code: "invalid_date", value: get("date") });
    const available = parseOptionalInt(get("available"));
    if (available === undefined)
      errors.push({ line, code: "invalid_available", value: get("available") });
    else if (available != null && roomType && available > roomType.totalRooms) {
      errors.push({ line, code: "available_exceeds_total", value: get("available") });
    }
    const rate = parseOptionalInt(get("rate"));
    if (rate === undefined) errors.push({ line, code: "invalid_rate", value: get("rate") });
    const closed = parseBool(get("closed"));
    if (closed === undefined) errors.push({ line, code: "invalid_closed", value: get("closed") });

    if (errors.length === before) {
      parsed.push({
        line,
        roomTypeId: roomType!.id,
        date: toIsoDate(date!),
        availableCount: available ?? null,
        rate: rate ?? null,
        closed: closed!,
      });
    }
  });
  return { rows: parsed, errors };
}

/** Upserts overrides; a row with no override values removes the date's override. */
export async function applyInventoryRows(
  db: TenantDb,
  organizationId: string,
  rows: InventoryRow[],
) {
  let upserted = 0;
  let cleared = 0;
  for (const row of rows) {
    const date = parseIsoDate(row.date)!;
    if (row.availableCount == null && row.rate == null && !row.closed) {
      cleared += (await db.availability.deleteMany({ where: { roomTypeId: row.roomTypeId, date } }))
        .count;
      continue;
    }
    await db.availability.upsert({
      where: { roomTypeId_date: { roomTypeId: row.roomTypeId, date } },
      create: {
        organizationId,
        roomTypeId: row.roomTypeId,
        date,
        availableCount: row.availableCount,
        rate: row.rate,
        closed: row.closed,
      },
      update: { availableCount: row.availableCount, rate: row.rate, closed: row.closed },
    });
    upserted++;
  }
  return { upserted, cleared };
}
