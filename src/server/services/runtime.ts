import "server-only";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { getLlmClient } from "@/server/agent/llm";
import { getNotifier, setNotifier } from "@/server/notifications";
import { EmailNotifier } from "@/server/notifications/email";
import type { ConversationDeps } from "./conversation";

let notifierReady = false;

/** Email notifications whenever an SMTP server is configured (Mailpit locally). */
function ensureNotifier() {
  if (notifierReady) return;
  notifierReady = true;
  if (env.EMAIL_SERVER) {
    setNotifier(
      new EmailNotifier(prisma, {
        server: env.EMAIL_SERVER,
        from: env.EMAIL_FROM,
        appUrl: env.APP_URL,
      }),
    );
  }
}

/** Production wiring for the conversation service. */
export function conversationDeps(): ConversationDeps {
  ensureNotifier();
  return {
    client: prisma,
    llm: getLlmClient(),
    notifier: getNotifier(),
    maxToolCalls: env.AI_MAX_TOOL_CALLS,
    timeoutMs: env.AI_TIMEOUT_MS,
  };
}
