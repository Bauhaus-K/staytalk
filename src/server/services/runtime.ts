import "server-only";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { getLlmClient } from "@/server/agent/llm";
import { getNotifier, setNotifier } from "@/server/notifications";
import { EmailNotifier } from "@/server/notifications/email";
import { registerPusher } from "@/server/channels/registry";
import { linePusher } from "./line";
import type { ConversationDeps } from "./conversation";

let runtimeReady = false;

/**
 * One-time wiring of process-wide integrations: email notifications whenever
 * an SMTP server is configured (Mailpit locally) and push delivery for LINE.
 * Call from any server entry point that may notify staff or message guests.
 */
export function ensureRuntime() {
  if (runtimeReady) return;
  runtimeReady = true;
  registerPusher("LINE", linePusher(prisma, env.LINE_MODE));
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
  ensureRuntime();
  return {
    client: prisma,
    llm: getLlmClient(),
    notifier: getNotifier(),
    maxToolCalls: env.AI_MAX_TOOL_CALLS,
    timeoutMs: env.AI_TIMEOUT_MS,
  };
}
