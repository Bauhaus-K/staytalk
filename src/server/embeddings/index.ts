import { HashEmbedder } from "./hash";
import type { Embedder } from "./types";
import { VoyageEmbedder } from "./voyage";

let cached: Embedder | null | undefined;

/**
 * Embedder selected by EMBEDDING_PROVIDER: "none" (default — trigram search
 * only), "hash" (local lexical baseline) or "voyage" (needs VOYAGE_API_KEY).
 */
export function getEmbedder(): Embedder | null {
  if (cached !== undefined) return cached;
  const provider = process.env.EMBEDDING_PROVIDER ?? "none";
  if (provider === "hash") cached = new HashEmbedder();
  else if (provider === "voyage" && process.env.VOYAGE_API_KEY) {
    cached = new VoyageEmbedder({
      apiKey: process.env.VOYAGE_API_KEY,
      model: process.env.VOYAGE_MODEL || undefined,
    });
  } else cached = null;
  return cached;
}

export type { Embedder } from "./types";
