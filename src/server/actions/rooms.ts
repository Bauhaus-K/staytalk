"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTenant } from "@/server/auth/session";
import { parseIsoDate } from "@/lib/dates";
import {
  applyInventoryRows,
  parseInventoryCsv,
  roomTypeInputSchema,
  roomTypeName,
  type CsvError,
} from "@/server/services/inventory";

const localeSchema = z.enum(["ko", "ja", "en"]).catch("ko");

export type RoomTypeFormState = { error?: "nameRequired" | "invalid" } | undefined;

export async function saveRoomType(
  _prev: RoomTypeFormState,
  formData: FormData,
): Promise<RoomTypeFormState> {
  const locale = localeSchema.parse(formData.get("locale"));
  const { user, db } = await requireTenant(locale);
  const parsed = roomTypeInputSchema.safeParse({
    ...Object.fromEntries(formData),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { error: "invalid" };
  const name = roomTypeName(parsed.data);
  if (!name) return { error: "nameRequired" };
  const { propertyId, capacity, pricingModel, baseRate, totalRooms, active } = parsed.data;

  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { id: true },
  });
  if (!property) return { error: "invalid" };

  const id = String(formData.get("id") ?? "");
  if (id) {
    const result = await db.roomType.updateMany({
      where: { id, propertyId },
      data: { name, capacity, pricingModel, baseRate, totalRooms, active },
    });
    if (result.count === 0) return { error: "invalid" };
  } else {
    const count = await db.roomType.count({ where: { propertyId } });
    await db.roomType.create({
      data: {
        organizationId: user.organizationId,
        propertyId,
        name,
        capacity,
        pricingModel,
        baseRate,
        totalRooms,
        active,
        sortOrder: count,
      },
    });
  }
  revalidatePath(`/${locale}/rooms`);
  redirect(`/${locale}/rooms?property=${propertyId}`);
}

const overrideSchema = z.object({
  locale: localeSchema,
  roomTypeId: z.string().min(1),
  date: z.string(),
  availableCount: z.string().optional(),
  rate: z.string().optional(),
  intent: z.enum(["apply", "clear"]),
});

export type OverrideState = { ok?: boolean; error?: "invalid" } | undefined;

/** Sets or clears one date's override from the calendar form. */
export async function saveInventoryOverride(
  _prev: OverrideState,
  formData: FormData,
): Promise<OverrideState> {
  const parsed = overrideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };
  const { locale, roomTypeId, intent } = parsed.data;
  const { user, db } = await requireTenant(locale);
  const date = parseIsoDate(parsed.data.date);
  const roomType = await db.roomType.findUnique({ where: { id: roomTypeId } });
  if (!date || !roomType) return { error: "invalid" };

  const toInt = (v?: string) => (v && v.trim() !== "" ? Number(v.replace(/,/g, "")) : null);
  const availableCount = toInt(parsed.data.availableCount);
  const rate = toInt(parsed.data.rate);
  const closed = formData.get("closed") === "on";
  const bad = (n: number | null) => n != null && (!Number.isInteger(n) || n < 0);
  if (bad(availableCount) || bad(rate) || (availableCount ?? 0) > roomType.totalRooms)
    return { error: "invalid" };

  await applyInventoryRows(db, user.organizationId, [
    {
      line: 0,
      roomTypeId,
      date: parsed.data.date,
      availableCount: intent === "clear" ? null : availableCount,
      rate: intent === "clear" ? null : rate,
      closed: intent === "clear" ? false : closed,
    },
  ]);
  revalidatePath(`/${locale}/rooms`);
  return { ok: true };
}

export type CsvState =
  | {
      csv?: string;
      rowCount?: number;
      errors?: CsvError[];
      applied?: { upserted: number; cleared: number };
      error?: "invalid";
    }
  | undefined;

async function loadCsvContext(formData: FormData) {
  const locale = localeSchema.parse(formData.get("locale"));
  const { user, db } = await requireTenant(locale);
  const propertyId = String(formData.get("propertyId") ?? "");
  const roomTypes = await db.roomType.findMany({
    where: { propertyId },
    select: { id: true, name: true, totalRooms: true },
  });
  return { locale, user, db, roomTypes };
}

/** Step 1: validate an uploaded CSV and report rows/errors (nothing is written). */
export async function previewInventoryCsv(_prev: CsvState, formData: FormData): Promise<CsvState> {
  const { roomTypes } = await loadCsvContext(formData);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 1_000_000)
    return { error: "invalid" };
  const csv = await file.text();
  const { rows, errors } = parseInventoryCsv(csv, roomTypes);
  return { csv, rowCount: rows.length, errors };
}

/** Step 2: apply the previewed CSV (re-validated; refuses if any error). */
export async function applyInventoryCsv(_prev: CsvState, formData: FormData): Promise<CsvState> {
  const { locale, user, db, roomTypes } = await loadCsvContext(formData);
  const csv = String(formData.get("csv") ?? "");
  const { rows, errors } = parseInventoryCsv(csv, roomTypes);
  if (errors.length || !rows.length) return { csv, rowCount: rows.length, errors };
  const applied = await applyInventoryRows(db, user.organizationId, rows);
  revalidatePath(`/${locale}/rooms`);
  return { applied };
}
