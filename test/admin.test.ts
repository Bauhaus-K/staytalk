import { afterAll, describe, expect, it } from "vitest";
import { verifyPassword } from "@/server/auth/password";
import { createOrganizationWithOwner } from "@/server/services/admin";
import { testDb } from "./db";

const client = testDb();
const email = "new-owner@admin-test.example";

afterAll(async () => {
  const user = await client.user.findUnique({ where: { email } });
  if (user) await client.organization.delete({ where: { id: user.organizationId } });
});

describe("createOrganizationWithOwner", () => {
  it("creates a tenant with an owner and refuses duplicate emails", async () => {
    const { organization, owner } = await createOrganizationWithOwner(client, {
      organizationName: "Test Stay",
      email: "New-Owner@Admin-Test.example",
      name: "Owner",
      password: "long-enough-password",
    });
    expect(owner).toMatchObject({ email, role: "OWNER", organizationId: organization.id });
    expect(await verifyPassword("long-enough-password", owner.passwordHash!)).toBe(true);
    await expect(
      createOrganizationWithOwner(client, { organizationName: "X", email, name: "Y" }),
    ).rejects.toThrow("already exists");
  });
});
