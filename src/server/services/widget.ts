import type { DbClient } from "@/server/db/client";
import type { TenantDb } from "@/server/db/tenant";

export type WidgetProperty = {
  id: string;
  organizationId: string;
  name: string;
  defaultLanguage: string;
  allowedOrigins: string[];
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: WidgetProperty | null; at: number }>();

const SELECT = {
  id: true,
  organizationId: true,
  name: true,
  defaultLanguage: true,
  allowedOrigins: true,
} as const;

async function cached(
  cacheKey: string,
  load: () => Promise<WidgetProperty | null>,
): Promise<WidgetProperty | null> {
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = await load();
  cache.set(cacheKey, { value, at: Date.now() });
  return value;
}

/**
 * Resolves a public widget key to its property. Cross-tenant by nature (the
 * key is the entry point), so it uses the unscoped client; results are cached
 * briefly because the proxy calls this for every widget frame load.
 */
export function getWidgetProperty(client: DbClient, key: string | null | undefined) {
  if (!key || key.length > 100) return Promise.resolve(null);
  return cached(`key:${key}`, () =>
    client.property.findUnique({ where: { widgetPublicKey: key }, select: SELECT }),
  );
}

/** Same as getWidgetProperty, by property id (from a verified widget token). */
export function getWidgetPropertyById(client: DbClient, id: string) {
  return cached(`id:${id}`, () => client.property.findUnique({ where: { id }, select: SELECT }));
}

/** Drops cached lookups (after settings changes). */
export function invalidateWidgetProperty() {
  cache.clear();
}

/** The guest session's latest web-widget conversation, if any. */
export function findWidgetConversation(db: TenantDb, propertyId: string, guestSessionId: string) {
  return db.conversation.findFirst({
    where: { propertyId, channel: "WEB_WIDGET", guestSessionId, isTest: false },
    orderBy: { createdAt: "desc" },
  });
}

export type GuestVisibleMessage = {
  id: string;
  from: "guest" | "host";
  kind: "guest" | "ai" | "staff" | "system";
  text: string;
  createdAt: string;
};

const MAX_MESSAGES = 50;

/**
 * Messages as the guest sees them: staff replies in the guest's language
 * (translated copy when available), nothing internal.
 */
export async function listGuestMessages(
  db: TenantDb,
  conversationId: string,
): Promise<GuestVisibleMessage[]> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { guestLanguage: true },
  });
  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: MAX_MESSAGES,
  });
  return rows.reverse().map((m) => {
    const staffTranslated =
      m.role === "STAFF" &&
      m.translatedContent &&
      m.translatedLanguage === conversation?.guestLanguage;
    return {
      id: m.id,
      from: m.role === "GUEST" ? "guest" : "host",
      kind:
        m.role === "GUEST"
          ? "guest"
          : m.role === "AI"
            ? "ai"
            : m.role === "STAFF"
              ? "staff"
              : "system",
      text: staffTranslated ? m.translatedContent! : m.content,
      createdAt: m.createdAt.toISOString(),
    };
  });
}
