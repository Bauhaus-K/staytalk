import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentTurnRequest,
  AgentTurnResponse,
  CompletionRequest,
  CompletionResponse,
  LlmClient,
  TokenUsage,
} from "./types";

export type AnthropicLlmOptions = {
  mainModel: string;
  fastModel: string;
  /** Effort for guest replies. Chat-style work; "medium" balances care and latency. */
  effort: "low" | "medium" | "high";
  timeoutMs: number;
  apiKey?: string;
  /** Injected in tests. */
  client?: Anthropic;
};

function toUsage(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

export class AnthropicLlmClient implements LlmClient {
  readonly mode = "live" as const;
  readonly mainModel: string;
  readonly fastModel: string;
  private readonly client: Anthropic;
  private readonly effort: AnthropicLlmOptions["effort"];
  private readonly timeoutMs: number;

  constructor(options: AnthropicLlmOptions) {
    this.mainModel = options.mainModel;
    this.fastModel = options.fastModel;
    this.effort = options.effort;
    this.timeoutMs = options.timeoutMs;
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 2 });
  }

  async agentTurn(request: AgentTurnRequest): Promise<AgentTurnResponse> {
    // Beta endpoint for server-side refusal fallback: a classifier decline is
    // retried on Anthropic's recommended fallback model inside the same call.
    // Never force tool_choice (rejected by current models); thinking stays at
    // the model default (adaptive) and is steered with effort.
    const response = await this.client.beta.messages.create(
      {
        model: this.mainModel,
        max_tokens: request.maxTokens,
        system: request.system,
        tools: request.tools,
        messages: request.messages,
        output_config: { effort: this.effort },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal: request.signal, timeout: this.timeoutMs },
    );
    return {
      model: response.model,
      content: response.content,
      stopReason: response.stop_reason,
      usage: toUsage(response.usage),
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    // Fast model, no server-side fallback (not supported on Haiku).
    const response = await this.client.messages.create(
      {
        model: this.fastModel,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        output_config: { effort: "low" },
      },
      { signal: request.signal, timeout: this.timeoutMs },
    );
    if (response.stop_reason === "refusal") {
      throw new Error("Fast model declined the request");
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { model: response.model, text, usage: toUsage(response.usage) };
  }
}
