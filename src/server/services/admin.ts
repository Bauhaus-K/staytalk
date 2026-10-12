import { z } from "zod";
import type { DbClient } from "@/server/db/client";
import { hashPassword } from "@/server/auth/password";
import { forOrg } from "@/server/db/tenant";

export const ownerInputSchema = z.object({
  organizationName: z.string().trim().min(1).max(100),
  email: z.email().transform((e) => e.toLowerCase()),
  name: z.string().trim().min(1).max(100),
  locale: z.enum(["ko", "ja", "en"]).default("ko"),
  /** Optional: without it the owner signs in with a magic link. */
  password: z.string().min(10).max(200).optional(),
});

/**
 * Creates a tenant and its first OWNER account (there is no self-signup).
 * The owner then adds properties with the setup wizard.
 */
export async function createOrganizationWithOwner(
  client: DbClient,
  raw: z.input<typeof ownerInputSchema>,
) {
  const input = ownerInputSchema.parse(raw);
  const existing = await client.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) throw new Error(`A user with ${input.email} already exists`);
  const organization = await client.organization.create({ data: { name: input.organizationName } });
  const owner = await forOrg(organization.id, client).user.create({
    data: {
      organizationId: organization.id,
      email: input.email,
      name: input.name,
      locale: input.locale,
      role: "OWNER",
      passwordHash: input.password ? await hashPassword(input.password) : null,
    },
  });
  return { organization, owner };
}
