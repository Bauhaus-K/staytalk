import { beforeAll, describe, expect, it } from "vitest";
import { MockLlmClient } from "@/server/agent/llm/mock";
import { forOrg } from "@/server/db/tenant";
import { MemoryNotifier } from "@/server/notifications";
import { EmailNotifier } from "@/server/notifications/email";
import { handleGuestMessage, type ConversationDeps } from "@/server/services/conversation";
import { resolveConversation, returnToAi, sendStaffReply } from "@/server/services/staff";
import {
  findWidgetConversation,
  getWidgetProperty,
  listGuestMessages,
} from "@/server/services/widget";
import { seedDemo } from "../prisma/seed/seed";
import { testDb } from "./db";

const client = testDb();
const ORG = "org_demo_seoul";
const llm = new MockLlmClient();
let propertyId: string;
let ownerId: string;
let deps: ConversationDeps;

beforeAll(async () => {
  const [seoul] = await seedDemo(client);
  propertyId = seoul!.id;
  ownerId = (await forOrg(ORG, client).user.findFirstOrThrow({ where: { role: "OWNER" } })).id;
  deps = { client, llm, notifier: new MemoryNotifier(), maxToolCalls: 6, timeoutMs: 10_000 };
});

async function escalatedConversation(sessionId: string) {
  return handleGuestMessage(
    {
      organizationId: ORG,
      propertyId,
      channel: "WEB_WIDGET",
      guestSessionId: sessionId,
      text: "Do you have a sauna?",
    },
    deps,
  );
}

describe("staff handling", () => {
  it("staff reply is translated for the guest, pauses the AI and records first response", async () => {
    const first = await escalatedConversation("s-reply");
    expect(first.status).toBe("ESCALATED");
    const db = forOrg(ORG, client);

    const message = await sendStaffReply(db, llm, {
      organizationId: ORG,
      conversationId: first.conversationId,
      userId: ownerId,
      text: "사우나는 없습니다.",
    });
    expect(message).toMatchObject({
      role: "STAFF",
      content: "사우나는 없습니다.",
      language: "ko",
      translatedLanguage: "en",
      translatedContent: "[en] 사우나는 없습니다.",
      authorUserId: ownerId,
    });
    const escalation = await db.escalation.findFirstOrThrow({
      where: { conversationId: first.conversationId },
    });
    expect(escalation.firstResponseAt).not.toBeNull();

    // Guest sees the translation, labelled as staff.
    const visible = await listGuestMessages(db, first.conversationId);
    expect(visible.at(-1)).toMatchObject({
      from: "host",
      kind: "staff",
      text: "[en] 사우나는 없습니다.",
    });

    // Guest writes again: the AI stays silent while staff handles it.
    const again = await handleGuestMessage(
      {
        organizationId: ORG,
        propertyId,
        conversationId: first.conversationId,
        channel: "WEB_WIDGET",
        guestSessionId: "s-reply",
        text: "OK thanks",
      },
      deps,
    );
    expect(again.replies).toHaveLength(0);
  });

  it("resolving closes open escalations; handing back lets the AI answer again", async () => {
    const first = await escalatedConversation("s-resolve");
    const db = forOrg(ORG, client);

    await resolveConversation(db, { conversationId: first.conversationId, userId: ownerId });
    const resolved = await db.conversation.findUniqueOrThrow({
      where: { id: first.conversationId },
    });
    expect(resolved).toMatchObject({ status: "RESOLVED", resolvedBy: "HUMAN" });
    const esc = await db.escalation.findFirstOrThrow({
      where: { conversationId: first.conversationId },
    });
    expect(esc).toMatchObject({ status: "RESOLVED", resolvedById: ownerId });

    await returnToAi(db, { conversationId: first.conversationId, userId: ownerId });
    const next = await handleGuestMessage(
      {
        organizationId: ORG,
        propertyId,
        conversationId: first.conversationId,
        channel: "WEB_WIDGET",
        guestSessionId: "s-resolve",
        text: "What time is breakfast?",
      },
      deps,
    );
    expect(next.status).toBe("AI_HANDLING");
    expect(next.replies[0]!.content).toContain("08:00");
  });

  it("cannot act on another tenant's conversation", async () => {
    const first = await escalatedConversation("s-tenant");
    const other = forOrg("org_demo_fukuoka", client);
    await expect(
      sendStaffReply(other, llm, {
        organizationId: "org_demo_fukuoka",
        conversationId: first.conversationId,
        userId: ownerId,
        text: "hi",
      }),
    ).rejects.toThrow();
    await expect(
      resolveConversation(other, { conversationId: first.conversationId, userId: ownerId }),
    ).rejects.toThrow();
  });
});

describe("widget service", () => {
  it("resolves keys and finds the session's conversation", async () => {
    const property = await getWidgetProperty(client, "pk_demo_seoul");
    expect(property).toMatchObject({ id: propertyId, organizationId: ORG });
    expect(await getWidgetProperty(client, "pk_missing")).toBeNull();

    const first = await escalatedConversation("s-widget");
    const found = await findWidgetConversation(forOrg(ORG, client), propertyId, "s-widget");
    expect(found?.id).toBe(first.conversationId);
    expect(await findWidgetConversation(forOrg(ORG, client), propertyId, "nobody")).toBeNull();
  });
});

describe("EmailNotifier", () => {
  it("emails every staff member in their own language", async () => {
    const notifier = new EmailNotifier(client, {
      server: { jsonTransport: true },
      from: "StayTalk <no-reply@test>",
      appUrl: "http://app.test",
    });
    const sent: { to: string; subject: string; text: string }[] = [];
    const original = notifier.transport.sendMail.bind(notifier.transport);
    notifier.transport.sendMail = (async (mail: { to: string; subject: string; text: string }) => {
      sent.push(mail);
      return original(mail as never);
    }) as never;

    await notifier.escalationCreated({
      organizationId: ORG,
      propertyId,
      propertyName: "서촌 한옥 게스트하우스",
      conversationId: "conv1",
      escalationId: "esc1",
      reason: "COMPLAINT",
      summary: "Guest says the room is noisy.",
      question: "Too noisy!",
    });
    expect(sent.map((m) => m.to).sort()).toEqual(["owner@seoul.example", "staff@seoul.example"]);
    expect(sent[0]!.subject).toBe("[StayTalk] 서촌 한옥 게스트하우스: 불만");
    expect(sent[0]!.text).toContain("http://app.test/ko/inbox/conv1");
    expect(sent[0]!.text).toContain("Too noisy!");
  });
});
