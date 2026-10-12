import { beforeAll, describe, expect, it } from "vitest";
import { MockLlmClient } from "@/server/agent/llm/mock";
import { forOrg } from "@/server/db/tenant";
import { MemoryNotifier } from "@/server/notifications";
import type { ConversationDeps } from "@/server/services/conversation";
import {
  linePusher,
  loadLineConnection,
  processLineMessages,
  saveLineConnection,
} from "@/server/services/line";
import { seedDemo } from "../prisma/seed/seed";
import { testDb } from "./db";

const client = testDb();
const ORG = "org_demo_fukuoka";
let propertyId: string;
let connectionId: string;
const deps = (): ConversationDeps => ({
  client,
  llm: new MockLlmClient(),
  notifier: new MemoryNotifier(),
  maxToolCalls: 6,
  timeoutMs: 10_000,
});

beforeAll(async () => {
  const [, fukuoka] = await seedDemo(client);
  propertyId = fukuoka!.id;
  const saved = await saveLineConnection(client, {
    organizationId: ORG,
    propertyId,
    externalId: "1650000000",
    channelSecret: "secret-1",
    accessToken: "token-1",
    active: true,
  });
  connectionId = saved.id;
});

describe("LINE channel", () => {
  it("stores credentials encrypted and keeps them when updated with blanks", async () => {
    const row = await client.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(row.secretEncrypted).not.toContain("secret-1");
    await saveLineConnection(client, {
      organizationId: ORG,
      propertyId,
      externalId: "1650000000",
      channelSecret: null,
      accessToken: null,
      active: true,
    });
    const connection = await loadLineConnection(client, connectionId, "mock");
    expect(connection?.propertyId).toBe(propertyId);
  });

  it("answers LINE messages through the agent and replies with the reply token", async () => {
    const connection = (await loadLineConnection(client, connectionId, "mock"))!;
    await processLineMessages(
      connection,
      [{ externalUserId: "Uline1", text: "大浴場は何時までですか？", replyToken: "rt-1" }],
      deps(),
    );
    expect(connection.adapter.sent).toHaveLength(1);
    expect(connection.adapter.sent[0]!.endpoint).toBe("reply");
    expect(JSON.stringify(connection.adapter.sent[0]!.body)).toContain("24:00");

    // The same LINE user continues the same conversation.
    await processLineMessages(
      connection,
      [{ externalUserId: "Uline1", text: "朝食は？", replyToken: "rt-2" }],
      deps(),
    );
    const conversations = await forOrg(ORG, client).conversation.findMany({
      where: { channel: "LINE", externalUserId: "Uline1" },
    });
    expect(conversations).toHaveLength(1);
  });

  it("pushes staff replies to the LINE user", async () => {
    const conversation = await forOrg(ORG, client).conversation.findFirstOrThrow({
      where: { channel: "LINE", externalUserId: "Uline1" },
    });
    const pushes: string[][] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => pushes.push(args.map(String));
    try {
      await linePusher(client, "mock")({ conversationId: conversation.id }, [
        { text: "スタッフです" },
      ]);
    } finally {
      console.info = original;
    }
    expect(pushes[0]?.[0]).toBe("[line:mock] push");
    expect(pushes[0]?.[1]).toContain('"to":"Uline1"');
  });

  it("ignores unknown or inactive connections", async () => {
    expect(await loadLineConnection(client, "nope", "mock")).toBeNull();
    await client.channelConnection.update({ where: { id: connectionId }, data: { active: false } });
    expect(await loadLineConnection(client, connectionId, "mock")).toBeNull();
    await client.channelConnection.update({ where: { id: connectionId }, data: { active: true } });
  });
});
