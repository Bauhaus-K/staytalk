import { randomBytes } from "node:crypto";
import type { DbClient } from "../../src/server/db/client";
import { hashPassword } from "../../src/server/auth/password";
import { forOrg } from "../../src/server/db/tenant";
import { fukuokaRyokan } from "./data/fukuoka";
import { seoulGuesthouse } from "./data/seoul";
import type { SeedProperty } from "./data/types";

export const DEMO_PROPERTIES = [seoulGuesthouse, fukuokaRyokan];

/** Dev-only password for all demo accounts. */
export const DEMO_PASSWORD = "staytalk-demo";

const AVAILABILITY_DAYS = 30;

function utcDate(offsetDays: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
}

async function seedOne(client: DbClient, data: SeedProperty, passwordHash: string) {
  // Idempotent: wipe the demo organization (cascades to all tenant rows).
  await client.organization.deleteMany({ where: { id: data.organization.id } });
  await client.organization.create({ data: data.organization });

  const db = forOrg(data.organization.id, client);

  await db.user.create({
    data: {
      ...data.owner,
      organizationId: data.organization.id,
      role: "OWNER",
      passwordHash,
      emailVerified: new Date(),
    },
  });
  for (const staff of data.staff) {
    await db.user.create({
      data: {
        ...staff,
        organizationId: data.organization.id,
        role: "STAFF",
        passwordHash,
        emailVerified: new Date(),
      },
    });
  }

  const property = await db.property.create({
    data: { ...data.property, organizationId: data.organization.id },
  });

  for (const [index, room] of data.roomTypes.entries()) {
    const { key: _key, ...rest } = room;
    const roomType = await db.roomType.create({
      data: {
        ...rest,
        organizationId: data.organization.id,
        propertyId: property.id,
        sortOrder: index,
      },
    });

    // Sample overrides: weekend surcharge and one sold-out night for the
    // last room type, so availability logic has something to chew on.
    const overrides = [];
    for (let d = 0; d < AVAILABILITY_DAYS; d++) {
      const date = utcDate(d);
      const weekday = date.getUTCDay();
      const isWeekend = weekday === 5 || weekday === 6;
      const soldOut = index === data.roomTypes.length - 1 && d === 10;
      if (!isWeekend && !soldOut) continue;
      overrides.push({
        organizationId: data.organization.id,
        roomTypeId: roomType.id,
        date,
        rate: isWeekend ? Math.round((room.baseRate * 1.2) / 1000) * 1000 : null,
        availableCount: soldOut ? 0 : null,
      });
    }
    if (overrides.length) await db.availability.createMany({ data: overrides });
  }

  await db.knowledgeItem.createMany({
    data: data.knowledge.map((k) => ({
      ...k,
      organizationId: data.organization.id,
      propertyId: property.id,
      language: data.property.defaultLanguage,
    })),
  });

  return property;
}

export async function seedDemo(client: DbClient) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const results = [];
  for (const data of DEMO_PROPERTIES) {
    results.push(await seedOne(client, data, passwordHash));
  }
  return results;
}

/** Random suffix helper for tests that need unique emails/keys. */
export const uniqueSuffix = () => randomBytes(4).toString("hex");
