import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forOrg } from "@/server/db/tenant";
import { testDb } from "./db";

const db = testDb();
const ORG_A = "org_test_iso_a";
const ORG_B = "org_test_iso_b";

async function makeTenant(orgId: string, key: string) {
  await db.organization.create({ data: { id: orgId, name: orgId } });
  const t = forOrg(orgId, db);
  const property = await t.property.create({
    data: {
      organizationId: orgId,
      name: `Property ${key}`,
      country: "KR",
      address: "addr",
      timezone: "Asia/Seoul",
      defaultLanguage: "ko",
      staffLanguage: "ko",
      currency: "KRW",
      widgetPublicKey: `pk_test_iso_${key}`,
    },
  });
  const item = await t.knowledgeItem.create({
    data: {
      organizationId: orgId,
      propertyId: property.id,
      category: "FAQ",
      question: `secret question ${key}`,
      content: `secret content ${key}`,
      language: "ko",
    },
  });
  return { property, item };
}

describe("tenant isolation (database)", () => {
  let a: Awaited<ReturnType<typeof makeTenant>>;
  let b: Awaited<ReturnType<typeof makeTenant>>;

  beforeAll(async () => {
    await db.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
    a = await makeTenant(ORG_A, "a");
    b = await makeTenant(ORG_B, "b");
  });

  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
  });

  it("lists only the current tenant's rows", async () => {
    const items = await forOrg(ORG_A, db).knowledgeItem.findMany();
    expect(items.map((i) => i.id)).toEqual([a.item.id]);
  });

  it("cannot read another tenant's row by id", async () => {
    const tA = forOrg(ORG_A, db);
    expect(await tA.knowledgeItem.findUnique({ where: { id: b.item.id } })).toBeNull();
    expect(await tA.property.findFirst({ where: { id: b.property.id } })).toBeNull();
  });

  it("cannot update or delete another tenant's rows", async () => {
    const tA = forOrg(ORG_A, db);
    const updated = await tA.knowledgeItem.updateMany({
      where: { id: b.item.id },
      data: { content: "hacked" },
    });
    expect(updated.count).toBe(0);
    await expect(
      tA.knowledgeItem.update({ where: { id: b.item.id }, data: { content: "hacked" } }),
    ).rejects.toThrow();
    const deleted = await tA.knowledgeItem.deleteMany({ where: { id: b.item.id } });
    expect(deleted.count).toBe(0);

    const stillThere = await forOrg(ORG_B, db).knowledgeItem.findUnique({
      where: { id: b.item.id },
    });
    expect(stillThere?.content).toBe("secret content b");
  });

  it("database rejects rows that reference another tenant's parent", async () => {
    // Org A tries to attach a knowledge item to org B's property.
    await expect(
      forOrg(ORG_A, db).knowledgeItem.create({
        data: {
          organizationId: ORG_A,
          propertyId: b.property.id,
          category: "FAQ",
          question: "q",
          content: "c",
          language: "ko",
        },
      }),
    ).rejects.toThrow();
  });

  it("aggregates are scoped", async () => {
    expect(await forOrg(ORG_B, db).knowledgeItem.count()).toBe(1);
    const orgs = await forOrg(ORG_B, db).organization.findMany();
    expect(orgs.map((o) => o.id)).toEqual([ORG_B]);
  });
});
