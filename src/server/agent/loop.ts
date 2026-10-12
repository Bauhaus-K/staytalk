import type { Prisma } from "@/generated/prisma/client";
import { extractSources } from "./system-prompt";
import type {
  AgentContentBlock,
  AgentMessage,
  LlmClient,
  SystemBlock,
  TokenUsage,
} from "./llm/types";
import { apiTools, findTool } from "./tools";
import type { ToolContext, ToolDefinition } from "./tools/types";

export type ToolCallRecord = {
  sequence: number;
  name: string;
  input: Prisma.InputJsonValue;
  output: Prisma.InputJsonValue | null;
  isError: boolean;
  durationMs: number;
};

export type AgentOutcome = "replied" | "error";

export type AgentRunResult = {
  outcome: AgentOutcome;
  reply: string | null;
  citedKnowledgeIds: string[];
  model: string;
  stopReason: string | null;
  usage: TokenUsage;
  toolCalls: ToolCallRecord[];
  latencyMs: number;
  error?: string;
};

export type AgentRunInput = {
  llm: LlmClient;
  system: SystemBlock[];
  /** Conversation history ending with the current guest message. */
  history: AgentMessage[];
  ctx: ToolContext;
  maxToolCalls: number;
  timeoutMs: number;
  /** Ids allowed in the <sources> line (the property's knowledge items). */
  knowledgeIds: Set<string>;
  tools?: ToolDefinition[];
  maxTokens?: number;
};

class AgentStop extends Error {}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

function textOf(content: AgentContentBlock[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

/**
 * Content to echo back after a server-side fallback: blocks before the last
 * `fallback` marker came from the declined model, so only its text survives
 * (thinking/tool_use from before the boundary must not be replayed or run).
 */
export function echoableContent(content: AgentContentBlock[]): AgentContentBlock[] {
  const boundary = content.findLastIndex((b) => (b.type as string) === "fallback");
  if (boundary < 0) return content;
  return [
    ...content.slice(0, boundary).filter((b) => b.type === "text"),
    ...content.slice(boundary + 1),
  ];
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) ?? {};
}

async function runTool(
  tool: ToolDefinition | undefined,
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<{ output: unknown; isError: boolean }> {
  if (!tool) return { output: { error: `Unknown tool: ${name}` }, isError: true };
  // Validate even with strict tools: strict drops some constraints (lengths).
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    return { output: { error: "Invalid input", issues: parsed.error.issues }, isError: true };
  }
  try {
    return { output: await tool.run(parsed.data, ctx), isError: false };
  } catch (error) {
    console.error(`[agent] tool ${name} failed`, error);
    return { output: { error: "Tool failed" }, isError: true };
  }
}

/**
 * Manual tool-use loop. Bounded by `maxToolCalls` and an overall timeout; any
 * failure returns outcome "error" and the caller falls back to a safe reply.
 */
export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const started = Date.now();
  const tools = input.tools;
  const toolSpecs = apiTools(tools);
  const messages: AgentMessage[] = [...input.history];
  const toolCalls: ToolCallRecord[] = [];
  let usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  let model = input.llm.mainModel;
  let stopReason: string | null = null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  const finish = (
    partial: Partial<AgentRunResult> & { outcome: AgentOutcome },
  ): AgentRunResult => ({
    reply: null,
    citedKnowledgeIds: [],
    model,
    stopReason,
    usage,
    toolCalls,
    latencyMs: Date.now() - started,
    ...partial,
  });

  try {
    // One extra turn beyond the tool budget lets the model write its answer.
    for (let turn = 0; turn <= input.maxToolCalls; turn++) {
      const response = await input.llm.agentTurn({
        system: input.system,
        tools: toolSpecs,
        messages,
        maxTokens: input.maxTokens ?? 1024,
        signal: controller.signal,
      });
      usage = addUsage(usage, response.usage);
      model = response.model;
      stopReason = response.stopReason;

      if (response.stopReason === "refusal") {
        throw new AgentStop("Model declined the request");
      }

      // Append the content (incl. thinking blocks) unchanged, minus anything a
      // declined model produced before a server-side fallback boundary.
      const content = echoableContent(response.content);
      messages.push({ role: "assistant", content: content as AgentMessage["content"] });

      const toolUses = content.filter((b) => b.type === "tool_use");
      if (response.stopReason !== "tool_use" || toolUses.length === 0) {
        if (response.stopReason === "pause_turn") continue;
        const { text, citedIds } = extractSources(textOf(content), input.knowledgeIds);
        if (!text && !input.ctx.state.escalation) throw new AgentStop("Empty reply");
        return finish({ outcome: "replied", reply: text || null, citedKnowledgeIds: citedIds });
      }

      if (toolCalls.length + toolUses.length > input.maxToolCalls) {
        throw new AgentStop("Tool call budget exceeded");
      }

      // Run sequentially: tools have DB side effects that should be ordered.
      const results: Extract<AgentMessage["content"], unknown[]> = [];
      for (const block of toolUses) {
        if (block.type !== "tool_use") continue;
        const t0 = Date.now();
        const { output, isError } = await runTool(
          findTool(block.name, tools),
          block.name,
          block.input,
          input.ctx,
        );
        const tool = findTool(block.name, tools);
        toolCalls.push({
          sequence: toolCalls.length,
          name: block.name,
          // Logs must not keep guest PII (e.g. booking contact details).
          input: toJson(tool?.redactInput ? tool.redactInput(block.input) : block.input),
          output: toJson(output),
          isError,
          durationMs: Date.now() - t0,
        });
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
          ...(isError ? { is_error: true } : {}),
        });
      }
      messages.push({ role: "user", content: results });
    }
    throw new AgentStop("Tool call budget exceeded");
  } catch (error) {
    const message = controller.signal.aborted
      ? "Timed out"
      : error instanceof Error
        ? error.message
        : String(error);
    if (!(error instanceof AgentStop) && !controller.signal.aborted) {
      console.error("[agent] run failed", error);
    }
    return finish({ outcome: "error", error: message });
  } finally {
    clearTimeout(timer);
  }
}
