"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { KnowledgeCategory } from "@/generated/prisma/enums";
import { requireTenant } from "@/server/auth/session";
import { GUEST_LANGUAGES } from "@/server/language/codes";
import TEMPLATES from "@/server/services/onboarding-templates.json";
import { scheduleEmbedding } from "@/server/services/embedding-runtime";

const localeSchema = z.enum(["ko", "ja", "en"]).catch("ko");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export type OnboardingState = { error?: "invalid" | "ownerOnly"; saved?: number } | undefined;

const propertySchema = z.object({
  name: z.string().trim().min(1).max(100),
  country: z.enum(["KR", "JP"]),
  address: z.string().trim().min(1).max(300),
  timezone: z.enum(["Asia/Seoul", "Asia/Tokyo"]),
  defaultLanguage: z.enum(GUEST_LANGUAGES),
  staffLanguage: z.enum(GUEST_LANGUAGES),
  currency: z.enum(["KRW", "JPY"]),
  checkInTime: time,
  checkOutTime: time,
  phone: z.string().trim().max(40).optional(),
});

/** Step 1: create a property or update its basics (owners only). */
export async function savePropertyStep(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const locale = localeSchema.parse(formData.get("locale"));
  const { user, db } = await requireTenant(locale);
  if (user.role !== "OWNER") return { error: "ownerOnly" };
  const parsed = propertySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };
  const data = { ...parsed.data, phone: parsed.data.phone || null };

  const id = String(formData.get("propertyId") ?? "");
  let propertyId = id;
  if (id) {
    const result = await db.property.updateMany({ where: { id }, data });
    if (result.count === 0) return { error: "invalid" };
  } else {
    const created = await db.property.create({
      data: {
        ...data,
        organizationId: user.organizationId,
        widgetPublicKey: `pk_${randomBytes(12).toString("hex")}`,
        allowedOrigins: [],
      },
    });
    propertyId = created.id;
  }
  revalidatePath(`/${locale}`, "layout");
  redirect(`/${locale}/onboarding?property=${propertyId}&step=2`);
}

const roomSchema = z.object({
  propertyId: z.string().min(1),
  roomName: z.string().trim().min(1).max(100),
  capacity: z.coerce.number().int().min(1).max(20),
  pricingModel: z.enum(["PER_ROOM", "PER_PERSON"]),
  baseRate: z.coerce.number().int().min(0).max(100_000_000),
  totalRooms: z.coerce.number().int().min(0).max(500),
});

/** Step 2: quick-add a room type (name in the staff's UI language). */
export async function addRoomTypeStep(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const locale = localeSchema.parse(formData.get("locale"));
  const { user, db } = await requireTenant(locale);
  const parsed = roomSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };
  const { propertyId, roomName, ...rest } = parsed.data;
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { id: true },
  });
  if (!property) return { error: "invalid" };
  const count = await db.roomType.count({ where: { propertyId } });
  await db.roomType.create({
    data: {
      ...rest,
      organizationId: user.organizationId,
      propertyId,
      name: { [locale]: roomName },
      sortOrder: count,
    },
  });
  revalidatePath(`/${locale}/onboarding`);
  return {};
}

/**
 * Step 3: turns answered template questions into knowledge items, written in
 * the staff's UI language. Questions already in the knowledge base are skipped.
 */
export async function saveKnowledgeStep(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const locale = localeSchema.parse(formData.get("locale"));
  const { user, db } = await requireTenant(locale);
  const propertyId = String(formData.get("propertyId") ?? "");
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { id: true },
  });
  if (!property) return { error: "invalid" };
  const t = await getTranslations({ locale, namespace: "onboarding.templates" });

  const existing = new Set(
    (await db.knowledgeItem.findMany({ where: { propertyId }, select: { question: true } })).map(
      (k) => k.question,
    ),
  );
  const rows = Object.entries(TEMPLATES as Record<string, KnowledgeCategory>)
    .map(([id, category]) => ({
      category,
      question: t(`${id}.question` as "checkin_time.question"),
      content: String(formData.get(`answer_${id}`) ?? "")
        .trim()
        .slice(0, 4000),
    }))
    .filter((r) => r.content && !existing.has(r.question));

  if (rows.length) {
    await db.knowledgeItem.createMany({
      data: rows.map((r) => ({
        ...r,
        organizationId: user.organizationId,
        propertyId,
        language: locale,
      })),
    });
    scheduleEmbedding(user.organizationId, propertyId);
  }
  revalidatePath(`/${locale}/onboarding`);
  revalidatePath(`/${locale}/knowledge`);
  return { saved: rows.length };
}
