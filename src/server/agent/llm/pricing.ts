import type { TokenUsage } from "./types";

/**
 * USD per million tokens, for cost estimates shown to operators. Cache writes
 * use the 5-minute ephemeral rate (1.25× input). Update when prices change;
 * unknown models (incl. "mock") cost 0.
 */
const PRICES: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

/** Estimated cost in micro-USD (USD × 1e6). $/MTok × tokens = micro-USD. */
export function estimateCostMicroUsd(model: string, usage: TokenUsage): number {
  const price = PRICES[model];
  if (!price) return 0;
  return Math.round(
    usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite,
  );
}
