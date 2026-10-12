import "server-only";
import { env } from "@/server/env";
import { AnthropicLlmClient } from "./anthropic";
import { MockLlmClient } from "./mock";
import type { LlmClient } from "./types";

let client: LlmClient | undefined;

/** Process-wide LLM client selected by AI_MODE. */
export function getLlmClient(): LlmClient {
  if (client) return client;
  if (env.AI_MODE === "live") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("AI_MODE=live requires ANTHROPIC_API_KEY");
    }
    client = new AnthropicLlmClient({
      mainModel: env.AI_MODEL_MAIN,
      fastModel: env.AI_MODEL_FAST,
      effort: env.AI_EFFORT,
      timeoutMs: env.AI_TIMEOUT_MS,
      apiKey: env.ANTHROPIC_API_KEY,
    });
  } else {
    client = new MockLlmClient();
  }
  return client;
}

export type { LlmClient } from "./types";
