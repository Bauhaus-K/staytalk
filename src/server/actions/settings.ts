"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/server/auth/session";
import { normalizeOrigin } from "@/server/security/origin";
import { invalidateWidgetProperty } from "@/server/services/widget";
import { prisma } from "@/server/db/client";
import { saveLineConnection } from "@/server/services/line";

export type OriginsState = { ok?: boolean; invalid?: string; error?: boolean } | undefined;

const MAX_ORIGINS = 20;

/** Owner updates the sites allowed to embed a property's widget. */
export async function updateAllowedOrigins(
  _prev: OriginsState,
  formData: FormData,
): Promise<OriginsState> {
  const locale = z.enum(["ko", "ja", "en"]).catch("ko").parse(formData.get("locale"));
  const { user, db } = await requireTenant(locale);
  if (user.role !== "OWNER") return { error: true };

  const propertyId = z.string().min(1).safeParse(formData.get("propertyId"));
  if (!propertyId.success) return { error: true };

  const lines = String(formData.get("origins") ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_ORIGINS);
  const origins: string[] = [];
  for (const line of lines) {
    const origin = normalizeOrigin(line);
    if (!origin) return { invalid: line };
    origins.push(origin);
  }

  const result = await db.property.updateMany({
    where: { id: propertyId.data },
    data: { allowedOrigins: [...new Set(origins)] },
  });
  if (result.count === 0) return { error: true };
  invalidateWidgetProperty();
  revalidatePath(`/${locale}/settings`);
  return { ok: true };
}

export type LineSettingsState =
  { ok?: boolean; error?: "credentialsRequired" | "ownerOnly" | "invalid" } | undefined;

/** Owner saves the property's LINE Messaging API credentials (encrypted at rest). */
export async function updateLineSettings(
  _prev: LineSettingsState,
  formData: FormData,
): Promise<LineSettingsState> {
  const locale = z.enum(["ko", "ja", "en"]).catch("ko").parse(formData.get("locale"));
  const { user, db } = await requireTenant(locale);
  if (user.role !== "OWNER") return { error: "ownerOnly" };
  const parsed = z
    .object({
      propertyId: z.string().min(1),
      externalId: z.string().trim().max(50),
      channelSecret: z.string().trim().max(200),
      accessToken: z.string().trim().max(1000),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };
  const property = await db.property.findUnique({
    where: { id: parsed.data.propertyId },
    select: { id: true },
  });
  if (!property) return { error: "invalid" };
  try {
    await saveLineConnection(prisma, {
      organizationId: user.organizationId,
      propertyId: property.id,
      externalId: parsed.data.externalId || null,
      channelSecret: parsed.data.channelSecret || null,
      accessToken: parsed.data.accessToken || null,
      active: formData.get("active") === "on",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "credentials_required")
      return { error: "credentialsRequired" };
    throw error;
  }
  revalidatePath(`/${locale}/settings`);
  return { ok: true };
}
