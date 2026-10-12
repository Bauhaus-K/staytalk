import { randomBytes } from "node:crypto";
import type { DbClient } from "../../src/server/db/client";
import { hashPassword } from "../../src/server/auth/password";
import { forOrg } from "../../src/server/db/tenant";
import { MockLlmClient } from "../../src/server/agent/llm/mock";
import { MemoryNotifier } from "../../src/server/notifications";
import { handleGuestMessage } from "../../src/server/services/conversation";
import { resolveConversation, sendStaffReply } from "../../src/server/services/staff";
import { createBookingRequest } from "../../src/server/services/booking";
import { closeIdleConversations } from "../../src/server/services/lifecycle";
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

/** Sample guest conversations so the inbox isn't empty in development. */
const SAMPLE_CONVERSATIONS: Record<
  string,
  { text: string; staffReply?: string; resolve?: boolean }[]
> = {
  org_demo_seoul: [
    { text: "Is there free Wi-Fi in the rooms?" },
    { text: "サウナはありますか？" },
    {
      text: "房间太吵了，晚上睡不着。",
      staffReply: "불편을 드려 죄송합니다. 바로 확인해 보겠습니다.",
      resolve: true,
    },
    { text: "체크인 몇 시부터 가능해요?" },
  ],
  org_demo_fukuoka: [
    { text: "저녁 식사는 몇 시예요?" },
    { text: "I have a tattoo. Can I use the public bath?" },
    {
      text: "我要求退款，房間跟照片不一樣。",
      staffReply: "ご不便をおかけし申し訳ございません。担当者よりご連絡いたします。",
    },
  ],
};

async function seedConversations(client: DbClient, organizationId: string, propertyId: string) {
  const llm = new MockLlmClient();
  const db = forOrg(organizationId, client);
  const owner = await db.user.findFirstOrThrow({ where: { role: "OWNER" } });
  for (const [index, sample] of (SAMPLE_CONVERSATIONS[organizationId] ?? []).entries()) {
    const result = await handleGuestMessage(
      {
        organizationId,
        propertyId,
        channel: "WEB_WIDGET",
        guestSessionId: `seed-${index}`,
        text: sample.text,
      },
      { client, llm, notifier: new MemoryNotifier(), maxToolCalls: 6, timeoutMs: 10_000 },
    );
    if (sample.staffReply) {
      await sendStaffReply(db, llm, {
        organizationId,
        conversationId: result.conversationId,
        userId: owner.id,
        text: sample.staffReply,
      });
    }
    if (sample.resolve) {
      await resolveConversation(db, { conversationId: result.conversationId, userId: owner.id });
    }
  }

  // One pending booking request per property for the bookings screen.
  const roomType = await db.roomType.findFirstOrThrow({
    where: { propertyId, capacity: { gte: 2 } },
  });
  const checkIn = utcDate(21);
  await createBookingRequest(db, new MemoryNotifier(), {
    organizationId,
    propertyId,
    conversationId: null,
    roomTypeId: roomType.id,
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: utcDate(23).toISOString().slice(0, 10),
    guests: 2,
    guestName: "Sample Guest",
    guestContact: "sample.guest@example.com",
    guestLanguage: "en",
    note: "Late arrival around 21:00",
  });
}

export async function seedDemo(client: DbClient, options: { sampleConversations?: boolean } = {}) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const results = [];
  for (const data of DEMO_PROPERTIES) {
    const property = await seedOne(client, data, passwordHash);
    if (options.sampleConversations) {
      await seedConversations(client, data.organization.id, property.id);
    }
    results.push(property);
  }
  if (options.sampleConversations) {
    // Close the sample AI conversations as if a day had passed, so the
    // automation-rate metric has data. Leaves one open per property.
    await closeIdleConversations(client, new Date(Date.now() + 25 * 3_600_000));
    for (const data of DEMO_PROPERTIES) {
      const property = results.find((p) => p.organizationId === data.organization.id)!;
      await handleGuestMessage(
        {
          organizationId: data.organization.id,
          propertyId: property.id,
          channel: "WEB_WIDGET",
          guestSessionId: "seed-open",
          text:
            data.property.defaultLanguage === "ja"
              ? "Wi-Fiのパスワードはどこですか？"
              : "와이파이 있나요?",
        },
        {
          client,
          llm: new MockLlmClient(),
          notifier: new MemoryNotifier(),
          maxToolCalls: 6,
          timeoutMs: 10_000,
        },
      );
    }
  }
  return results;
}

/** Random suffix helper for tests that need unique emails/keys. */
export const uniqueSuffix = () => randomBytes(4).toString("hex");
