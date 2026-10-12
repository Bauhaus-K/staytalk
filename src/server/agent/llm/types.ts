import type Anthropic from "@anthropic-ai/sdk";

export type SystemBlock = Anthropic.Beta.BetaTextBlockParam;
export type AgentMessage = Anthropic.Beta.BetaMessageParam;
export type AgentTool = Anthropic.Beta.BetaTool;
export type AgentContentBlock = Anthropic.Beta.BetaContentBlock;

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type AgentTurnRequest = {
  system: SystemBlock[];
  tools: AgentTool[];
  messages: AgentMessage[];
  maxTokens: number;
  signal?: AbortSignal;
};

export type AgentTurnResponse = {
  /** Model that actually served the turn (differs from the requested one after a fallback). */
  model: string;
  content: AgentContentBlock[];
  stopReason: string | null;
  usage: TokenUsage;
};

export type CompletionRequest = {
  system: string;
  prompt: string;
  maxTokens: number;
  signal?: AbortSignal;
};

export type CompletionResponse = {
  model: string;
  text: string;
  usage: TokenUsage;
};

/**
 * Narrow LLM surface used by the app. `agentTurn` runs the main (tool-using)
 * model; `complete` runs the fast model for translation/classification.
 */
export interface LlmClient {
  readonly mode: "mock" | "live";
  readonly mainModel: string;
  readonly fastModel: string;
  agentTurn(request: AgentTurnRequest): Promise<AgentTurnResponse>;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
