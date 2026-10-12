import "server-only";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { getLlmClient } from "@/server/agent/llm";
import { getNotifier } from "@/server/notifications";
import type { ConversationDeps } from "./conversation";

/** Production wiring for the conversation service. */
export function conversationDeps(): ConversationDeps {
  return {
    client: prisma,
    llm: getLlmClient(),
    notifier: getNotifier(),
    maxToolCalls: env.AI_MAX_TOOL_CALLS,
    timeoutMs: env.AI_TIMEOUT_MS,
  };
}
