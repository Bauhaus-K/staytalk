import { beforeAll, describe, expect, it } from "vitest";
import { MockLlmClient } from "@/server/agent/llm/mock";
import type { AgentTurnResponse, LlmClient } from "@/server/agent/llm/types";
import { forOrg } from "@/server/db/tenant";
import { parseIsoDate } from "@/lib/dates";
import { MemoryNotifier } from "@/server/notifications";
import { handleGuestMessage, type ConversationDeps } from "@/server/services/conversation";
import { closeIdleConversations } from "@/server/services/lifecycle";
import { getPropertyMetrics } from "@/server/services/metrics";
import { sendStaffReply } from "@/server/services/staff";
import { listUnansweredQuestions } from "@/server/services/unanswered";
import { usageStatus } from "@/server/services/usage";
import { seedDemo } from "../prisma/seed/seed";
import { testDb } from "./db";

const client = testDb();
const ORG = "org_demo_seoul";
const db = forOrg(ORG, client);
let propertyId: string;
let ownerId: string;

// Mock agent that reports Sonnet-like token usage so cost math is exercised.
function pricedMock(): LlmClient {
  const mock = new MockLlmClient();
  return {
    ...mock,
    mode: "live",
    mainModel: "claude-sonnet-5-5",
    fastModel: "claude-haiku-5-5",
    async agentTurn(req): Promise<AgentTurnResponse> {
      const r = await mock.agentTurn(req);
      return {
        ...r,
        model: "claude-sonnet-5-5",
        usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 5000, cacheWriteTokens: 0 },
      };
    },
    async complete(req) {
      return {
        model: "claude-haiku-5-5",
        text: `[t] ${req.prompt}`,
        usage: { inputTokens: 200, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
      };
    },
  };
}

beforeAll(async () => {
  const [seoul] = await seedDemo(client);
  propertyId = seoul!.id;
  ownerId = (await db.user.findFirstOrThrow({ where: { role: "OWNER" } })).id;
});

describe("usage ledger", () => {
  it("records every model call with kind and estimated cost", async () => {
    const deps: ConversationDeps = {
      client,
      llm: pricedMock(),
      notifier: new MemoryNotifier(),
      maxToolCalls: 6,
      timeoutMs: 10_000,
    };
    const result = await handleGuestMessage(
      {
        organizationId: ORG,
        propertyId,
        channel: "WEB_WIDGET",
        guestSessionId: "u1",
        text: "What time is check-in?",
      },
      deps,
    );
    const rows = await db.llmUsage.findMany({ where: { conversationId: result.conversationId } });
    const kinds = rows.map((r) => r.kind).sort();
    // 2 agent turns (search, answer) + 2 translations (guest msg, AI reply) to Korean.
    expect(kinds).toEqual(["AGENT", "AGENT", "TRANSLATION", "TRANSLATION"]);
    const agent = rows.find((r) => r.kind === "AGENT")!;
    // 1000×$2 + 100×$10 + 5000×$0.20 per MTok = 4000 micro-USD
    expect(agent.costMicroUsd).toBe(4000);
    const translation = rows.find((r) => r.kind === "TRANSLATION")!;
    expect(translation.costMicroUsd).toBe(Math.round(200 * 0.1 + 50 * 0.5));

    const status = await usageStatus(db, { id: propertyId, monthlyTokenLimit: 10_000 });
    // tokens = input + output + 0.1×cacheRead, summed over the 4 calls
    expect(status.tokens).toBe(2 * (1000 + 100 + 500) + 2 * (200 + 50));
    expect(status.level).toBe("ok");
    expect((await usageStatus(db, { id: propertyId, monthlyTokenLimit: 4000 })).level).toBe(
      "warning",
    );
    expect((await usageStatus(db, { id: propertyId, monthlyTokenLimit: 3000 })).level).toBe("over");
  });
});

describe("closeIdleConversations", () => {
  it("closes idle AI conversations, attributing them to AI only without staff involvement", async () => {
    const deps: ConversationDeps = {
      client,
      llm: new MockLlmClient(),
      notifier: new MemoryNotifier(),
      maxToolCalls: 6,
      timeoutMs: 10_000,
    };
    const send = (sid: string, text: string) =>
      handleGuestMessage(
        { organizationId: ORG, propertyId, channel: "WEB_WIDGET", guestSessionId: sid, text },
        deps,
      );

    const aiOnly = await send("idle-ai", "조식 있어요?");
    const staffTouched = await send("idle-staff", "주차 되나요?");
    await sendStaffReply(db, deps.llm, {
      organizationId: ORG,
      conversationId: staffTouched.conversationId,
      userId: ownerId,
      text: "주차는 근처 공영주차장을 이용해 주세요.",
    });
    // Staff reply paused the AI; hand it back so it is AI_HANDLING again.
    await db.conversation.update({
      where: { id: staffTouched.conversationId },
      data: { status: "AI_HANDLING" },
    });

    const later = new Date(Date.now() + 25 * 3_600_000);
    const result = await closeIdleConversations(client, later);
    expect(result.closed).toBeGreaterThanOrEqual(2);
    const [a, b] = await Promise.all([
      db.conversation.findUniqueOrThrow({ where: { id: aiOnly.conversationId } }),
      db.conversation.findUniqueOrThrow({ where: { id: staffTouched.conversationId } }),
    ]);
    expect(a).toMatchObject({ status: "RESOLVED", resolvedBy: "AI" });
    expect(b).toMatchObject({ status: "RESOLVED", resolvedBy: "HUMAN" });
  });
});

describe("getPropertyMetrics", () => {
  it("computes KPIs from a known fixture", async () => {
    // Isolated fixture on a fresh property-less window: use the Fukuoka tenant.
    const ORG_F = "org_demo_fukuoka";
    const f = forOrg(ORG_F, client);
    const property = await f.property.findFirstOrThrow();
    const day = (iso: string, hour = 3) => new Date(`${iso}T0${hour}:00:00Z`);
    const mk = (data: Record<string, unknown>) =>
      f.conversation.create({
        data: { organizationId: ORG_F, propertyId: property.id, channel: "WEB_WIDGET", ...data },
      });
    const c1 = await mk({
      createdAt: day("2026-08-01"),
      guestLanguage: "ko",
      status: "RESOLVED",
      resolvedBy: "AI",
    });
    await mk({
      createdAt: day("2026-08-01"),
      guestLanguage: "ko",
      status: "RESOLVED",
      resolvedBy: "AI",
    });
    const c3 = await mk({
      createdAt: day("2026-08-02"),
      guestLanguage: "en",
      status: "RESOLVED",
      resolvedBy: "HUMAN",
    });
    await mk({ createdAt: day("2026-08-03"), guestLanguage: "ja", status: "ESCALATED" });
    await mk({
      createdAt: day("2026-08-03"),
      guestLanguage: "ja",
      status: "AI_HANDLING",
      isTest: true,
    });
    await f.escalation.create({
      data: {
        organizationId: ORG_F,
        conversationId: c3.id,
        reason: "COMPLAINT",
        summary: "s",
        createdAt: day("2026-08-02", 1),
        firstResponseAt: new Date(day("2026-08-02", 1).getTime() + 30 * 60_000),
      },
    });
    await f.escalation.create({
      data: {
        organizationId: ORG_F,
        conversationId: c1.id,
        reason: "UNKNOWN_ANSWER",
        summary: "s",
        createdAt: day("2026-08-01"),
      },
    });

    const m = await getPropertyMetrics(f, {
      propertyId: property.id,
      timezone: "Asia/Tokyo",
      from: parseIsoDate("2026-08-01")!,
      to: parseIsoDate("2026-08-04")!,
    });
    expect(m.conversations.total).toBe(4); // test conversation excluded
    expect(m.conversations.byDay).toEqual([
      { date: "2026-08-01", count: 2 },
      { date: "2026-08-02", count: 1 },
      { date: "2026-08-03", count: 1 },
    ]);
    expect(m.automation).toMatchObject({ resolved: 3, resolvedByAi: 2, rate: 2 / 3, escalated: 1 });
    expect(m.languages).toEqual([
      { language: "ko", count: 2 },
      { language: "en", count: 1 },
      { language: "ja", count: 1 },
    ]);
    expect(m.escalations.byReason).toEqual([
      { reason: "COMPLAINT", count: 1 },
      { reason: "UNKNOWN_ANSWER", count: 1 },
    ]);
    expect(m.escalations.firstResponse).toEqual({ count: 1, avgMinutes: 30, medianMinutes: 30 });
  });
});

describe("unanswered questions", () => {
  it("lists UNKNOWN_ANSWER questions with staff translation until added or dismissed", async () => {
    const deps: ConversationDeps = {
      client,
      llm: new MockLlmClient(),
      notifier: new MemoryNotifier(),
      maxToolCalls: 6,
      timeoutMs: 10_000,
    };
    await handleGuestMessage(
      {
        organizationId: ORG,
        propertyId,
        channel: "WEB_WIDGET",
        guestSessionId: "uq",
        text: "Is there a rooftop bar?",
      },
      deps,
    );
    const list = await listUnansweredQuestions(db, propertyId);
    const item = list.find((q) => q.question === "Is there a rooftop bar?");
    expect(item?.translated).toBe("[ko] Is there a rooftop bar?");

    await db.escalation.update({
      where: { id: item!.id },
      data: { knowledgeDismissedAt: new Date() },
    });
    expect((await listUnansweredQuestions(db, propertyId)).some((q) => q.id === item!.id)).toBe(
      false,
    );
  });
});
