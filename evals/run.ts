/**
 * Agent eval runner.
 *
 *   pnpm eval                      # mock mode (default unless AI_MODE=live)
 *   pnpm eval --mode=live          # real Claude API (needs ANTHROPIC_API_KEY)
 *   pnpm eval --filter=seoul-ko    # substring filter on case id
 *   pnpm eval --min-pass-rate=0.9  # non-zero exit below this pass rate
 *
 * Runs every case as a fresh conversation against the demo properties in the
 * test database (DATABASE_URL_TEST), then grades it with deterministic checks
 * and writes JSON + Markdown reports to evals/reports/.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AnthropicLlmClient } from "../src/server/agent/llm/anthropic";
import { MockLlmClient } from "../src/server/agent/llm/mock";
import type { LlmClient } from "../src/server/agent/llm/types";
import { createClient } from "../src/server/db/client";
import { forOrg } from "../src/server/db/tenant";
import { detectLanguageHeuristic } from "../src/server/language/detect";
import { MemoryNotifier } from "../src/server/notifications";
import { handleGuestMessage } from "../src/server/services/conversation";
import { DEMO_PROPERTIES, seedDemo } from "../prisma/seed/seed";
import { evalFileSchema, type EvalCase } from "./schema";

/** Highest phase whose agent tools are implemented. */
const CURRENT_PHASE = 1;

const ROOT = path.dirname(new URL(import.meta.url).pathname);

type Check = { name: string; pass: boolean; detail?: string };
type CaseResult = {
  id: string;
  category: string;
  property: string;
  status: "pass" | "fail" | "skip" | "error";
  skipReason?: string;
  checks: Check[];
  reply: string;
  replies: string[];
  tools: string[];
  escalationReasons: string[];
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  latencyMs: number;
  error?: string;
};

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function loadCases(): EvalCase[] {
  const dir = path.join(ROOT, "cases");
  const cases = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => evalFileSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))));
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`Duplicate eval case id: ${c.id}`);
    ids.add(c.id);
  }
  return cases;
}

function createLlm(mode: "mock" | "live"): LlmClient {
  if (mode === "mock") return new MockLlmClient();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("--mode=live requires ANTHROPIC_API_KEY");
  return new AnthropicLlmClient({
    mainModel: process.env.AI_MODEL_MAIN ?? "claude-sonnet-5-5",
    fastModel: process.env.AI_MODEL_FAST ?? "claude-haiku-5-5",
    effort: (process.env.AI_EFFORT as "low" | "medium" | "high" | undefined) ?? "medium",
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

const includesCi = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

async function main() {
  const mode = (arg("mode") ?? (process.env.AI_MODE === "live" ? "live" : "mock")) as
    "mock" | "live";
  const filter = arg("filter");
  const minPassRate = arg("min-pass-rate") ? Number(arg("min-pass-rate")) : undefined;

  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set (see .env.example)");
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: url },
  });

  const client = createClient(url);
  const llm = createLlm(mode);
  const notifier = new MemoryNotifier();
  const properties = await seedDemo(client);
  const propertyByKey = {
    seoul: { orgId: DEMO_PROPERTIES[0]!.organization.id, propertyId: properties[0]!.id },
    fukuoka: { orgId: DEMO_PROPERTIES[1]!.organization.id, propertyId: properties[1]!.id },
  };

  const cases = loadCases().filter((c) => !filter || c.id.includes(filter));
  const results: CaseResult[] = [];
  const started = Date.now();

  for (const c of cases) {
    const base: CaseResult = {
      id: c.id,
      category: c.category,
      property: c.property,
      status: "skip",
      checks: [],
      reply: "",
      replies: [],
      tools: [],
      escalationReasons: [],
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      latencyMs: 0,
    };
    if (c.requiresPhase && c.requiresPhase > CURRENT_PHASE) {
      results.push({ ...base, skipReason: `requires phase ${c.requiresPhase}` });
      continue;
    }
    if (c.modes && !c.modes.includes(mode)) {
      results.push({ ...base, skipReason: `${mode} mode not applicable` });
      continue;
    }

    const { orgId, propertyId } = propertyByKey[c.property];
    const db = forOrg(orgId, client);
    try {
      let conversationId: string | undefined;
      let last: Awaited<ReturnType<typeof handleGuestMessage>> | undefined;
      const t0 = Date.now();
      for (const turn of c.turns) {
        last = await handleGuestMessage(
          {
            organizationId: orgId,
            propertyId,
            conversationId,
            channel: "WEB_WIDGET",
            guestSessionId: `eval:${c.id}`,
            text: turn,
            isTest: true,
          },
          {
            client,
            llm,
            notifier,
            maxToolCalls: Number(process.env.AI_MAX_TOOL_CALLS ?? 6),
            timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
          },
        );
        conversationId = last.conversationId;
      }
      const latencyMs = Date.now() - t0;
      const result = last!;

      const [runs, escalations, guestMessage] = await Promise.all([
        db.agentRun.findMany({
          where: { conversationId: result.conversationId },
          include: { toolCalls: { orderBy: { sequence: "asc" } } },
          orderBy: { createdAt: "asc" },
        }),
        db.escalation.findMany({ where: { conversationId: result.conversationId } }),
        db.message.findUnique({ where: { id: result.guestMessageId } }),
      ]);
      const lastRun = runs.find((r) => r.triggerMessageId === result.guestMessageId);
      const replies = result.replies.map((r) => r.content);
      const reply = replies.join("\n");
      const tools = lastRun?.toolCalls.map((t) => t.name) ?? [];
      const reasons = escalations.map((e) => e.reason);
      const e = c.expect;
      const checks: Check[] = [];

      if (e.language) {
        checks.push({
          name: "language",
          pass: result.guestLanguage === e.language,
          detail: result.guestLanguage,
        });
      }
      if (e.replyLanguage && mode === "live") {
        const detected = detectLanguageHeuristic(replies[0] ?? "")?.language;
        checks.push({
          name: "replyLanguage",
          pass: detected === e.replyLanguage,
          detail: detected,
        });
      }
      if (e.escalate !== undefined) {
        checks.push({
          name: "escalate",
          pass: (result.status === "ESCALATED") === e.escalate,
          detail: result.status,
        });
      }
      if (e.escalationReasonIn) {
        checks.push({
          name: "escalationReason",
          pass: reasons.some((r) => e.escalationReasonIn!.includes(r)),
          detail: reasons.join(",") || "none",
        });
      }
      for (const tool of e.toolsCalled ?? []) {
        checks.push({ name: `calls ${tool}`, pass: tools.includes(tool), detail: tools.join(",") });
      }
      for (const tool of e.toolsNotCalled ?? []) {
        checks.push({
          name: `does not call ${tool}`,
          pass: !tools.includes(tool),
          detail: tools.join(","),
        });
      }
      for (const group of e.replyIncludes ?? []) {
        checks.push({
          name: `includes ${group.join(" | ")}`,
          pass: group.some((needle) => includesCi(reply, needle)),
        });
      }
      for (const needle of e.replyExcludes ?? []) {
        checks.push({ name: `excludes "${needle}"`, pass: !includesCi(reply, needle) });
      }
      if (e.citesKnowledge !== undefined) {
        const cites = (lastRun?.citedKnowledgeIds.length ?? 0) > 0;
        checks.push({ name: "citesKnowledge", pass: cites === e.citesKnowledge });
      }
      for (const needle of e.storedGuestExcludes ?? []) {
        checks.push({
          name: `stored message excludes "${needle}"`,
          pass: !(guestMessage?.content ?? "").includes(needle),
        });
      }

      const tokens = runs.reduce(
        (acc, r) => ({
          input: acc.input + r.inputTokens,
          output: acc.output + r.outputTokens,
          cacheRead: acc.cacheRead + r.cacheReadTokens,
          cacheWrite: acc.cacheWrite + r.cacheWriteTokens,
        }),
        { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      );
      results.push({
        ...base,
        status: checks.every((ch) => ch.pass) ? "pass" : "fail",
        checks,
        reply,
        replies,
        tools,
        escalationReasons: reasons,
        tokens,
        latencyMs,
      });
    } catch (error) {
      results.push({
        ...base,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const r = results.at(-1)!;
    const mark = { pass: "✓", fail: "✗", error: "!", skip: "-" }[r.status];
    console.log(
      `${mark} ${r.id}${
        r.status === "fail"
          ? `  (${r.checks
              .filter((x) => !x.pass)
              .map((x) => x.name)
              .join("; ")})`
          : ""
      }${r.error ? `  ${r.error}` : ""}`,
    );
  }

  await client.$disconnect();
  writeReports(mode, results, Date.now() - started);

  const ran = results.filter((r) => r.status !== "skip");
  const passed = ran.filter((r) => r.status === "pass").length;
  const rate = ran.length ? passed / ran.length : 1;
  if (minPassRate !== undefined && rate < minPassRate) process.exitCode = 1;
}

function writeReports(mode: string, results: CaseResult[], durationMs: number) {
  const ran = results.filter((r) => r.status !== "skip");
  const passed = ran.filter((r) => r.status === "pass").length;
  const skipped = results.length - ran.length;
  const byCategory = new Map<string, { pass: number; total: number }>();
  for (const r of ran) {
    const entry = byCategory.get(r.category) ?? { pass: 0, total: 0 };
    entry.total++;
    if (r.status === "pass") entry.pass++;
    byCategory.set(r.category, entry);
  }
  const tokens = ran.reduce(
    (acc, r) => ({
      input: acc.input + r.tokens.input,
      output: acc.output + r.tokens.output,
      cacheRead: acc.cacheRead + r.tokens.cacheRead,
      cacheWrite: acc.cacheWrite + r.tokens.cacheWrite,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  );
  const avgLatency = ran.length
    ? Math.round(ran.reduce((s, r) => s + r.latencyMs, 0) / ran.length)
    : 0;
  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "-");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(ROOT, "reports");
  mkdirSync(dir, { recursive: true });
  const summary = {
    mode,
    phase: CURRENT_PHASE,
    total: results.length,
    ran: ran.length,
    passed,
    skipped,
    passRate: ran.length ? passed / ran.length : null,
    avgLatencyMs: avgLatency,
    tokens,
    durationMs,
  };
  writeFileSync(
    path.join(dir, `${mode}-${stamp}.json`),
    JSON.stringify({ summary, results }, null, 2),
  );

  const md = [
    `# Eval report (${mode})`,
    "",
    `- Date: ${new Date().toISOString()}`,
    `- Passed: **${passed}/${ran.length}** (${pct(passed, ran.length)}), skipped ${skipped}`,
    `- Avg latency per case: ${avgLatency}ms; total ${Math.round(durationMs / 1000)}s`,
    `- Tokens: input ${tokens.input}, output ${tokens.output}, cache read ${tokens.cacheRead}, cache write ${tokens.cacheWrite}`,
    "",
    "| Category | Pass |",
    "| --- | --- |",
    ...[...byCategory].map(([cat, v]) => `| ${cat} | ${v.pass}/${v.total} |`),
    "",
    "## Failures",
    "",
    ...(ran.some((r) => r.status !== "pass")
      ? ran
          .filter((r) => r.status !== "pass")
          .flatMap((r) => [
            `### ${r.id} (${r.status})`,
            r.error ? `Error: ${r.error}` : "",
            ...r.checks
              .filter((c) => !c.pass)
              .map((c) => `- ✗ ${c.name}${c.detail ? ` (got: ${c.detail})` : ""}`),
            "",
            "```",
            r.reply,
            "```",
            "",
          ])
      : ["None."]),
    "",
    "## Skipped",
    "",
    ...results.filter((r) => r.status === "skip").map((r) => `- ${r.id}: ${r.skipReason}`),
    "",
  ].join("\n");
  const mdPath = path.join(dir, `${mode}-${stamp}.md`);
  writeFileSync(mdPath, md);

  console.log("");
  console.log(`Passed ${passed}/${ran.length} (${pct(passed, ran.length)}), skipped ${skipped}`);
  for (const [cat, v] of byCategory) console.log(`  ${cat.padEnd(10)} ${v.pass}/${v.total}`);
  console.log(`Report: ${path.relative(process.cwd(), mdPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
