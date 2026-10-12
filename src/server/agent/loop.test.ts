import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { echoableContent, runAgent, type AgentRunInput } from "./loop";
import type {
  AgentContentBlock,
  AgentTurnRequest,
  AgentTurnResponse,
  LlmClient,
} from "./llm/types";
import { ZERO_USAGE } from "./llm/types";
import { defineTool, type ToolContext, type ToolDefinition } from "./tools/types";

type Step = (req: AgentTurnRequest) => Partial<AgentTurnResponse> | Promise<never>;

function scripted(steps: Step[]): LlmClient & { requests: AgentTurnRequest[] } {
  const requests: AgentTurnRequest[] = [];
  return {
    mode: "mock",
    mainModel: "test-model",
    fastModel: "test-fast",
    requests,
    async agentTurn(req) {
      // Snapshot: the loop mutates its message array between turns.
      requests.push({ ...req, messages: [...req.messages] });
      const step = steps[requests.length - 1];
      if (!step) throw new Error("no more steps");
      const r = await step(req);
      return {
        model: "test-model",
        content: [],
        stopReason: "end_turn",
        usage: { ...ZERO_USAGE, inputTokens: 10, outputTokens: 5 },
        ...r,
      };
    },
    async complete() {
      throw new Error("unused");
    },
  };
}

const text = (t: string) => ({ type: "text", text: t, citations: null }) as AgentContentBlock;
const toolUse = (id: string, name: string, input: unknown) =>
  ({ type: "tool_use", id, name, input }) as AgentContentBlock;
const thinking = { type: "thinking", thinking: "", signature: "sig" } as AgentContentBlock;

const echoTool = defineTool({
  name: "echo",
  description: "echo",
  schema: z.object({ value: z.string().max(5) }),
  async run(input) {
    return { echoed: input.value };
  },
});
const failingTool = defineTool({
  name: "boom",
  description: "fails",
  schema: z.object({}),
  async run() {
    throw new Error("db down");
  },
});

function input(llm: LlmClient, overrides: Partial<AgentRunInput> = {}): AgentRunInput {
  return {
    llm,
    system: [{ type: "text", text: "sys" }],
    history: [{ role: "user", content: "hi" }],
    ctx: { state: {} } as ToolContext,
    maxToolCalls: 3,
    timeoutMs: 5_000,
    knowledgeIds: new Set(["k1"]),
    tools: [echoTool, failingTool] as ToolDefinition[],
    ...overrides,
  };
}

describe("runAgent", () => {
  it("runs tools, feeds results back and returns the cleaned reply with sources", async () => {
    const llm = scripted([
      () => ({
        stopReason: "tool_use",
        content: [thinking, toolUse("t1", "echo", { value: "a" })],
      }),
      () => ({ content: [text("Check-in is 15:00.\n<sources>k1,unknown</sources>")] }),
    ]);
    const result = await runAgent(input(llm));
    expect(result.outcome).toBe("replied");
    expect(result.reply).toBe("Check-in is 15:00.");
    expect(result.citedKnowledgeIds).toEqual(["k1"]);
    expect(result.toolCalls).toMatchObject([
      { name: "echo", isError: false, output: { echoed: "a" } },
    ]);
    expect(result.usage.inputTokens).toBe(20);

    // Assistant content (incl. thinking) is passed back unchanged, then tool results.
    const second = llm.requests[1]!.messages;
    expect(second[1]).toEqual({
      role: "assistant",
      content: [thinking, toolUse("t1", "echo", { value: "a" })],
    });
    expect(second[2]).toMatchObject({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: '{"echoed":"a"}' }],
    });
  });

  it("returns validation and execution errors to the model as is_error results", async () => {
    const llm = scripted([
      () => ({
        stopReason: "tool_use",
        content: [
          toolUse("t1", "echo", { value: "too-long-value" }),
          toolUse("t2", "boom", {}),
          toolUse("t3", "nope", {}),
        ],
      }),
      () => ({ content: [text("Sorry.")] }),
    ]);
    const result = await runAgent(input(llm));
    expect(result.toolCalls.map((t) => [t.name, t.isError])).toEqual([
      ["echo", true],
      ["boom", true],
      ["nope", true],
    ]);
    const results = llm.requests[1]!.messages.at(-1)!.content as { is_error?: boolean }[];
    expect(results.every((r) => r.is_error)).toBe(true);
    expect(result.outcome).toBe("replied");
  });

  it("stops when the tool-call budget is exceeded", async () => {
    const loopForever: Step = () => ({
      stopReason: "tool_use",
      content: [toolUse(`t${Math.random()}`, "echo", { value: "x" })],
    });
    const llm = scripted([loopForever, loopForever, loopForever, loopForever, loopForever]);
    const result = await runAgent(input(llm, { maxToolCalls: 2 }));
    expect(result.outcome).toBe("error");
    expect(result.error).toMatch(/budget/);
    expect(result.toolCalls).toHaveLength(2);
  });

  it("treats a refusal as an error outcome", async () => {
    const llm = scripted([() => ({ stopReason: "refusal", content: [] })]);
    const result = await runAgent(input(llm));
    expect(result).toMatchObject({ outcome: "error", error: "Model declined the request" });
  });

  it("times out via AbortSignal", async () => {
    const llm = scripted([
      (req) =>
        new Promise<never>((_, reject) => {
          req.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    ]);
    const result = await runAgent(input(llm, { timeoutMs: 50 }));
    expect(result).toMatchObject({ outcome: "error", error: "Timed out" });
  });

  it("returns an error for an empty reply when nothing was escalated", async () => {
    const llm = scripted([() => ({ content: [text("<sources>k1</sources>")] })]);
    expect((await runAgent(input(llm))).outcome).toBe("error");
  });

  it("logs unexpected client errors and returns an error outcome", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const llm = scripted([() => Promise.reject(new Error("network"))]);
    const result = await runAgent(input(llm));
    expect(result).toMatchObject({ outcome: "error", error: "network" });
    spy.mockRestore();
  });
});

describe("echoableContent", () => {
  it("drops non-text blocks from before the last fallback boundary", () => {
    const fallback = {
      type: "fallback",
      from: { model: "a" },
      to: { model: "b" },
    } as unknown as AgentContentBlock;
    const content = [
      thinking,
      text("partial"),
      toolUse("t0", "echo", {}),
      fallback,
      toolUse("t1", "echo", { value: "a" }),
    ];
    expect(echoableContent(content)).toEqual([
      text("partial"),
      toolUse("t1", "echo", { value: "a" }),
    ]);
    expect(echoableContent([thinking, text("x")])).toEqual([thinking, text("x")]);
  });

  it("only runs tool calls from after the fallback boundary", async () => {
    const fallback = {
      type: "fallback",
      from: { model: "a" },
      to: { model: "b" },
    } as unknown as AgentContentBlock;
    const llm = scripted([
      () => ({
        stopReason: "tool_use",
        content: [toolUse("t0", "boom", {}), fallback, toolUse("t1", "echo", { value: "a" })],
      }),
      () => ({ content: [text("done")] }),
    ]);
    const result = await runAgent(input(llm));
    expect(result.toolCalls.map((t) => t.name)).toEqual(["echo"]);
  });
});
