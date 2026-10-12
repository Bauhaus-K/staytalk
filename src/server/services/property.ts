import type { TenantDb } from "@/server/db/tenant";

/** The tenant's properties plus the one selected via `?property=` (default: first). */
export async function resolveActiveProperty(db: TenantDb, requestedId?: string | null) {
  const properties = await db.property.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, defaultLanguage: true, staffLanguage: true, country: true },
  });
  const active = properties.find((p) => p.id === requestedId) ?? properties[0] ?? null;
  return { properties, active };
}
