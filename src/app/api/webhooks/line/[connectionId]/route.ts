import { after } from "next/server";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { conversationDeps } from "@/server/services/runtime";
import { loadLineConnection, processLineMessages } from "@/server/services/line";

/**
 * LINE Messaging API webhook (one URL per property connection). Verifies the
 * signature, acknowledges immediately, and handles messages after the
 * response so LINE doesn't time out while the agent runs.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/webhooks/line/[connectionId]">,
) {
  const { connectionId } = await params;
  const connection = await loadLineConnection(prisma, connectionId, env.LINE_MODE);
  if (!connection) return new Response("Not found", { status: 404 });
  if (!(await connection.adapter.verifySignature(request))) {
    return new Response("Invalid signature", { status: 401 });
  }
  const messages = await connection.adapter.receive(request);
  if (messages.length) {
    after(() => processLineMessages(connection, messages, conversationDeps()));
  }
  // Empty event lists are LINE's "Verify" requests.
  return new Response(null, { status: 200 });
}
