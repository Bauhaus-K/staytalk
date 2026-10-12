import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AnthropicLlmClient } from "./anthropic";

function fakeSdk() {
  const calls: { beta: unknown[]; plain: unknown[] } = { beta: [], plain: [] };
  const usage = {
    input_tokens: 100,
    output_tokens: 20,
    cache_read_input_tokens: 4000,
    cache_creation_input_tokens: 0,
  };
  const sdk = {
    beta: {
      messages: {
        create: async (...args: unknown[]) => {
          calls.beta.push(args);
          return { model: "claude-sonnet-5-5", content: [], stop_reason: "end_turn", usage };
        },
      },
    },
    messages: {
      create: async (...args: unknown[]) => {
        calls.plain.push(args);
        return {
          model: "claude-haiku-5-5",
          content: [{ type: "text", text: " 안녕하세요 " }],
          stop_reason: "end_turn",
          usage,
        };
      },
    },
  } as unknown as Anthropic;
  return { sdk, calls };
}

describe("AnthropicLlmClient", () => {
  it("sends agent turns to the main model with fallback, effort and no forced tool_choice", async () => {
    const { sdk, calls } = fakeSdk();
    const llm = new AnthropicLlmClient({
      mainModel: "claude-sonnet-5-5",
      fastModel: "claude-haiku-5-5",
      effort: "medium",
      timeoutMs: 1234,
      client: sdk,
    });
    const res = await llm.agentTurn({
      system: [{ type: "text", text: "s", cache_control: { type: "ephemeral" } }],
      tools: [],
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 1024,
    });
    const [params, options] = calls.beta[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(params).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 1024,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    expect(params).not.toHaveProperty("tool_choice");
    expect(params).not.toHaveProperty("thinking");
    expect(options).toMatchObject({ timeout: 1234 });
    expect(res.usage).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 4000,
      cacheWriteTokens: 0,
    });
  });

  it("uses the fast model without fallbacks for completions", async () => {
    const { sdk, calls } = fakeSdk();
    const llm = new AnthropicLlmClient({
      mainModel: "m",
      fastModel: "claude-haiku-5-5",
      effort: "low",
      timeoutMs: 1000,
      client: sdk,
    });
    const res = await llm.complete({ system: "translate", prompt: "x", maxTokens: 100 });
    const [params] = calls.plain[0] as [Record<string, unknown>];
    expect(params).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "low" } });
    expect(params).not.toHaveProperty("fallbacks");
    expect(res.text).toBe("안녕하세요");
  });
});
