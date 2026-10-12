import type { DbClient } from "@/server/db/client";
import { forOrg } from "@/server/db/tenant";
import { LineAdapter } from "@/server/channels/line";
import type { InboundMessage } from "@/server/channels/types";
import { decryptSecret, encryptSecret } from "@/server/security/secrets";
import { handleGuestMessage, type ConversationDeps } from "./conversation";

export type LineConnection = {
  id: string;
  organizationId: string;
  propertyId: string;
  adapter: LineAdapter;
};

/** Loads an active LINE connection (system lookup by id) with decrypted credentials. */
export async function loadLineConnection(
  client: DbClient,
  connectionId: string,
  mode: "mock" | "live",
  fetchImpl?: typeof fetch,
): Promise<LineConnection | null> {
  const row = await client.channelConnection.findUnique({ where: { id: connectionId } });
  if (!row || row.channel !== "LINE" || !row.active) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    propertyId: row.propertyId,
    adapter: new LineAdapter({
      channelSecret: decryptSecret(row.secretEncrypted),
      accessToken: decryptSecret(row.accessTokenEncrypted),
      mode,
      fetch: fetchImpl,
    }),
  };
}

/**
 * Handles verified LINE text messages: one conversation per LINE user and
 * property (the latest one is continued), replies via the reply token.
 */
export async function processLineMessages(
  connection: LineConnection,
  messages: InboundMessage[],
  deps: ConversationDeps,
) {
  const db = forOrg(connection.organizationId, deps.client);
  for (const message of messages) {
    try {
      const existing = await db.conversation.findFirst({
        where: {
          propertyId: connection.propertyId,
          channel: "LINE",
          externalUserId: message.externalUserId,
          isTest: false,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const result = await handleGuestMessage(
        {
          organizationId: connection.organizationId,
          propertyId: connection.propertyId,
          conversationId: existing?.id ?? null,
          channel: "LINE",
          externalUserId: message.externalUserId,
          text: message.text,
        },
        deps,
      );
      if (result.replies.length) {
        await connection.adapter.send(
          {
            conversationId: result.conversationId,
            externalUserId: message.externalUserId,
            replyToken: message.replyToken,
          },
          result.replies.map((r) => ({ text: r.content })),
        );
      }
    } catch (error) {
      // One failing message must not drop the rest of the batch.
      console.error("[line] message handling failed", error);
    }
  }
}

/** Push sender for staff replies / booking outcomes in LINE conversations. */
export function linePusher(client: DbClient, mode: "mock" | "live") {
  return async (
    target: { conversationId: string; externalUserId?: string | null },
    messages: { text: string }[],
  ) => {
    const conversation = await client.conversation.findUnique({
      where: { id: target.conversationId },
      select: { propertyId: true, externalUserId: true },
    });
    if (!conversation?.externalUserId) return;
    const row = await client.channelConnection.findUnique({
      where: { propertyId_channel: { propertyId: conversation.propertyId, channel: "LINE" } },
      select: { id: true },
    });
    if (!row) return;
    const connection = await loadLineConnection(client, row.id, mode);
    await connection?.adapter.send(
      { ...target, externalUserId: conversation.externalUserId },
      messages,
    );
  };
}

/** Creates or updates a property's LINE connection; blank secrets keep the stored ones. */
export async function saveLineConnection(
  client: DbClient,
  input: {
    organizationId: string;
    propertyId: string;
    externalId: string | null;
    channelSecret: string | null;
    accessToken: string | null;
    active: boolean;
  },
) {
  const db = forOrg(input.organizationId, client);
  const existing = await db.channelConnection.findFirst({
    where: { propertyId: input.propertyId, channel: "LINE" },
  });
  if (!existing) {
    if (!input.channelSecret || !input.accessToken) throw new Error("credentials_required");
    return db.channelConnection.create({
      data: {
        organizationId: input.organizationId,
        propertyId: input.propertyId,
        channel: "LINE",
        externalId: input.externalId,
        secretEncrypted: encryptSecret(input.channelSecret),
        accessTokenEncrypted: encryptSecret(input.accessToken),
        active: input.active,
      },
    });
  }
  return db.channelConnection.update({
    where: { id: existing.id },
    data: {
      externalId: input.externalId,
      active: input.active,
      ...(input.channelSecret ? { secretEncrypted: encryptSecret(input.channelSecret) } : {}),
      ...(input.accessToken ? { accessTokenEncrypted: encryptSecret(input.accessToken) } : {}),
    },
  });
}
