import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { forOrg } from "@/server/db/tenant";

export type CurrentUser = {
  id: string;
  organizationId: string;
  role: "OWNER" | "STAFF";
  locale: string;
  name: string | null;
  email: string | null;
};

/** Returns the signed-in staff user or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.organizationId) return null;
  return {
    id: u.id,
    organizationId: u.organizationId,
    role: u.role,
    locale: u.locale,
    name: u.name ?? null,
    email: u.email ?? null,
  };
}

/**
 * Data-access entry point for server components/actions: resolves the user and
 * a tenant-scoped DB client in one call. Redirects to login when signed out.
 */
export async function requireTenant(locale: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  return { user, db: forOrg(user.organizationId) };
}
