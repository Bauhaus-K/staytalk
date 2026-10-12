import { afterAll, describe, expect, it } from "vitest";
import { verifyPassword } from "@/server/auth/password";
import { forOrg } from "@/server/db/tenant";
import { testDb } from "../../test/db";
import { DEMO_PASSWORD, DEMO_PROPERTIES, seedDemo } from "./seed";

const db = testDb();

describe("demo seed", () => {
  afterAll(async () => {
    await db.organization.deleteMany({
      where: { id: { in: DEMO_PROPERTIES.map((d) => d.organization.id) } },
    });
  });

  it("creates two properties with 20 knowledge items each and is idempotent", async () => {
    await seedDemo(db);
    await seedDemo(db);

    for (const data of DEMO_PROPERTIES) {
      const t = forOrg(data.organization.id, db);
      expect(await t.property.count()).toBe(1);
      expect(await t.knowledgeItem.count()).toBe(20);
      expect(await t.roomType.count()).toBe(data.roomTypes.length);

      const owner = await t.user.findUnique({ where: { email: data.owner.email } });
      expect(owner?.role).toBe("OWNER");
      expect(await verifyPassword(DEMO_PASSWORD, owner!.passwordHash!)).toBe(true);
    }
  });

  it("covers every knowledge category the agent relies on", () => {
    for (const data of DEMO_PROPERTIES) {
      const categories = new Set(data.knowledge.map((k) => k.category));
      for (const c of [
        "HOUSE_RULES",
        "CHECKIN",
        "FACILITY",
        "TRANSPORT",
        "NEARBY",
        "FAQ",
        "POLICY",
      ]) {
        expect(categories.has(c as never), `${data.property.name} missing ${c}`).toBe(true);
      }
    }
  });
});
