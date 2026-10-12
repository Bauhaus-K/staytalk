import type { Channel, MessageRole } from "@/generated/prisma/enums";
import type { DbClient } from "@/server/db/client";
import { forOrg, type TenantDb } from "@/server/db/tenant";
import { runAgent, type AgentRunResult } from "@/server/agent/loop";
import type { AgentMessage, LlmClient } from "@/server/agent/llm/types";
import { buildSystemPrompt } from "@/server/agent/system-prompt";
import { detectEmergency } from "@/server/agent/emergency";
import type { ToolContext } from "@/server/agent/tools/types";
import { GUEST_STRINGS } from "@/server/language/guest-strings";
import { isGuestLanguage, type GuestLanguage } from "@/server/language/codes";
import { detectGuestLanguage, translateText } from "@/server/language/translate";
import type { Notifier } from "@/server/notifications";
import type { Embedder } from "@/server/embeddings";
import { maskContact } from "@/server/privacy/contact";
import { maskPii } from "@/server/privacy/pii";
import { escalateConversation } from "./escalation";
import { listKnowledgeForPrompt } from "./knowledge";
import { isOverMonthlyLimit, trackUsage } from "./usage";

export const MAX_GUEST_MESSAGE_LENGTH = 2000;

export type ConversationDeps = {
  client: DbClient;
  llm: LlmClient;
  notifier: Notifier;
  /** Enables hybrid (semantic) knowledge search when set. */
  embedder?: Embedder | null;
  maxToolCalls: number;
  timeoutMs: number;
  /** Messages of history sent to the model (including the current one). */
  historyLimit?: number;
  now?: () => Date;
};

export type GuestMessageInput = {
  organizationId: string;
  propertyId: string;
  conversationId?: string | null;
  channel: Channel;
  guestSessionId?: string | null;
  externalUserId?: string | null;
  text: string;
  isTest?: boolean;
};

export type OutgoingMessage = {
  id: string;
  role: Extract<MessageRole, "AI" | "SYSTEM">;
  content: string;
  language: GuestLanguage;
};

export type GuestMessageResult = {
  conversationId: string;
  guestMessageId: string;
  guestLanguage: GuestLanguage;
  status: "AI_HANDLING" | "ESCALATED" | "RESOLVED";
  replies: OutgoingMessage[];
  agentRunId?: string;
};

type Property = NonNullable<Awaited<ReturnType<TenantDb["property"]["findUnique"]>>>;

function fallbackLanguage(property: Property): GuestLanguage {
  return isGuestLanguage(property.defaultLanguage) ? property.defaultLanguage : "en";
}

async function findOrCreateConversation(db: TenantDb, input: GuestMessageInput) {
  if (input.conversationId) {
    const existing = await db.conversation.findFirst({
      where: { id: input.conversationId, propertyId: input.propertyId },
    });
    if (existing) return existing;
  }
  return db.conversation.create({
    data: {
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      channel: input.channel,
      guestSessionId: input.guestSessionId ?? null,
      externalUserId: input.externalUserId ?? null,
      isTest: input.isTest ?? false,
    },
  });
}

/** Recent messages as model history; staff/system/AI messages become assistant turns. */
async function loadHistory(
  db: TenantDb,
  conversationId: string,
  guestLanguage: GuestLanguage,
  limit: number,
): Promise<AgentMessage[]> {
  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const history: AgentMessage[] = rows.reverse().map((m) => {
    if (m.role === "GUEST") return { role: "user", content: m.content };
    const text =
      m.role === "STAFF" && m.translatedLanguage === guestLanguage && m.translatedContent
        ? m.translatedContent
        : m.content;
    return { role: "assistant", content: text };
  });
  while (history.length && history[0]!.role !== "user") history.shift();
  return history;
}

/**
 * Handles one inbound guest message end to end and returns the replies to
 * deliver on the channel. Channel adapters call this; it never throws for
 * model failures (guests always get a safe reply).
 */
export async function handleGuestMessage(
  input: GuestMessageInput,
  deps: ConversationDeps,
): Promise<GuestMessageResult> {
  const now = deps.now ?? (() => new Date());
  const db = forOrg(input.organizationId, deps.client);
  const property = await db.property.findUnique({ where: { id: input.propertyId } });
  if (!property) throw new Error("Property not found");

  const conversation = await findOrCreateConversation(db, input);
  const previousStatus = conversation.status;
  // Every model call of this turn is recorded in the usage ledger.
  const llm = trackUsage(deps.llm, {
    db,
    organizationId: input.organizationId,
    propertyId: property.id,
    conversationId: conversation.id,
  });

  // 1. Mask PII before anything is stored or sent to a model. Card/passport
  // numbers never reach the model. Contact details (email/phone) are masked
  // in storage but passed to the model for this turn only, so it can file a
  // booking request; the canonical copy lives in BookingRequest.
  const raw = input.text.trim().slice(0, MAX_GUEST_MESSAGE_LENGTH);
  const pii = maskPii(raw);
  const contact = maskContact(pii.text);
  const storedText = contact.text;

  // 2. Detect language (sticky per conversation for ambiguous input).
  const guestLanguage = await detectGuestLanguage(llm, storedText, {
    previous: conversation.guestLanguage,
    fallback: fallbackLanguage(property),
  });
  const strings = GUEST_STRINGS[guestLanguage];

  const guestMessage = await db.message.create({
    data: {
      organizationId: input.organizationId,
      conversationId: conversation.id,
      role: "GUEST",
      content: storedText,
      language: guestLanguage,
      piiMasked: pii.masked || contact.masked,
    },
  });
  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      guestLanguage,
      lastMessageAt: now(),
      // A new question after resolution reopens the conversation.
      ...(previousStatus === "RESOLVED"
        ? { status: "AI_HANDLING", resolvedBy: null, resolvedAt: null }
        : {}),
    },
  });

  // Staff-side translation runs alongside the agent.
  const guestTranslation = translateText(llm, storedText, guestLanguage, property.staffLanguage);

  const ctx: ToolContext = {
    organizationId: input.organizationId,
    conversationId: conversation.id,
    property: {
      id: property.id,
      name: property.name,
      country: property.country,
      defaultLanguage: property.defaultLanguage,
      staffLanguage: property.staffLanguage,
      timezone: property.timezone,
    },
    guestLanguage,
    guestMessage: storedText,
    db,
    client: deps.client,
    notifier: deps.notifier,
    embedder: deps.embedder ?? null,
    now: now(),
    state: {},
  };

  const replies: { role: "AI" | "SYSTEM"; content: string }[] = [];
  let noticeSent = conversation.escalationNoticeSent;
  let agentRunId: string | undefined;

  if (previousStatus === "ESCALATED") {
    // 3a. Staff owns the conversation: tell the guest once, then stay silent.
    if (!noticeSent) {
      replies.push({ role: "SYSTEM", content: strings.escalationNotice });
      noticeSent = true;
    }
  } else if (detectEmergency(storedText)) {
    // 3b. Life-safety guidance never waits for (or depends on) the model.
    await escalateConversation(ctx, {
      reason: "EMERGENCY",
      summary: `Emergency keywords detected in guest message: "${storedText.slice(0, 300)}"`,
    });
    replies.push({ role: "SYSTEM", content: strings.emergency(property.country) });
    noticeSent = true;
  } else if (await isOverMonthlyLimit(db, property, now())) {
    // 3c. Monthly token cap reached: hand over instead of calling the model.
    await escalateConversation(ctx, {
      reason: "USAGE_LIMIT",
      summary: "Monthly AI usage limit reached; guest message needs a staff reply.",
    });
    replies.push({ role: "SYSTEM", content: strings.escalationNotice });
    noticeSent = true;
  } else {
    // 3d. Agent run.
    const [roomTypes, knowledge, history] = await Promise.all([
      db.roomType.findMany({
        where: { propertyId: property.id, active: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
      listKnowledgeForPrompt(db, property.id),
      loadHistory(db, conversation.id, guestLanguage, deps.historyLimit ?? 20),
    ]);
    const system = buildSystemPrompt({ property, roomTypes, knowledge, guestLanguage, now: now() });
    // The current message goes to the model with contact details intact.
    const last = history.at(-1);
    if (last?.role === "user") last.content = pii.text;

    const result = await runAgent({
      llm,
      system,
      history,
      ctx,
      maxToolCalls: deps.maxToolCalls,
      timeoutMs: deps.timeoutMs,
      knowledgeIds: new Set(knowledge.map((k) => k.id)),
    });

    if (result.outcome === "error" && !ctx.state.escalation) {
      await escalateConversation(ctx, {
        reason: "UNKNOWN_ANSWER",
        summary: `AI could not answer (${result.error ?? "error"}).`,
      });
    }

    if (result.outcome === "replied" && result.reply) {
      // Don't let the model echo contact details into the log.
      replies.push({ role: "AI", content: maskContact(result.reply).text });
    } else {
      replies.push({
        role: "SYSTEM",
        content: result.outcome === "error" ? strings.checkingAnswer : strings.escalationNotice,
      });
    }
    if (ctx.state.escalation) noticeSent = true;

    agentRunId = await recordAgentRun(db, {
      organizationId: input.organizationId,
      conversationId: conversation.id,
      triggerMessageId: guestMessage.id,
      mode: deps.llm.mode,
      escalated: Boolean(ctx.state.escalation),
      result,
    });
  }

  if (pii.masked) replies.push({ role: "SYSTEM", content: strings.piiWarning });

  // 4. Store replies with staff-language translations.
  const stored: OutgoingMessage[] = [];
  for (const reply of replies) {
    const translation = await translateText(
      llm,
      reply.content,
      guestLanguage,
      property.staffLanguage,
    );
    const message = await db.message.create({
      data: {
        organizationId: input.organizationId,
        conversationId: conversation.id,
        role: reply.role,
        content: reply.content,
        language: guestLanguage,
        translatedContent: translation?.text ?? null,
        translatedLanguage: translation ? property.staffLanguage : null,
      },
    });
    stored.push({
      id: message.id,
      role: reply.role,
      content: reply.content,
      language: guestLanguage,
    });
  }

  const translated = await guestTranslation;
  if (translated) {
    await db.message.update({
      where: { id: guestMessage.id },
      data: { translatedContent: translated.text, translatedLanguage: property.staffLanguage },
    });
  }

  const updated = await db.conversation.update({
    where: { id: conversation.id },
    data: { escalationNoticeSent: noticeSent, lastMessageAt: now() },
  });

  return {
    conversationId: conversation.id,
    guestMessageId: guestMessage.id,
    guestLanguage,
    status: updated.status,
    replies: stored,
    agentRunId,
  };
}

async function recordAgentRun(
  db: TenantDb,
  params: {
    organizationId: string;
    conversationId: string;
    triggerMessageId: string;
    mode: "mock" | "live";
    escalated: boolean;
    result: AgentRunResult;
  },
): Promise<string> {
  const { result } = params;
  const run = await db.agentRun.create({
    data: {
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      triggerMessageId: params.triggerMessageId,
      mode: params.mode,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      latencyMs: result.latencyMs,
      stopReason: result.stopReason,
      error: result.error ?? null,
      citedKnowledgeIds: result.citedKnowledgeIds,
      outcome: result.outcome === "error" ? "error" : params.escalated ? "escalated" : "replied",
    },
  });
  if (result.toolCalls.length) {
    await db.toolCall.createMany({
      data: result.toolCalls.map((call) => ({
        organizationId: params.organizationId,
        agentRunId: run.id,
        sequence: call.sequence,
        name: call.name,
        input: call.input,
        output: call.output ?? undefined,
        isError: call.isError,
        durationMs: call.durationMs,
      })),
    });
  }
  return run.id;
}
