import { EMBEDDING_DIMENSIONS, type Embedder, type EmbeddingInputType } from "./types";

const BATCH = 128;

/**
 * Voyage AI embeddings (multilingual; Anthropic's recommended embedding
 * provider). Requires VOYAGE_API_KEY. Not enabled by default — see the
 * Phase 5 report: enabling it adds an external data processor.
 */
export class VoyageEmbedder implements Embedder {
  readonly model: string;

  constructor(
    private readonly options: {
      apiKey: string;
      model?: string;
      fetch?: typeof fetch;
      timeoutMs?: number;
    },
  ) {
    this.model = options.model ?? "voyage-3.5";
  }

  async embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const response = await (this.options.fetch ?? fetch)(
        "https://api.voyageai.com/v1/embeddings",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify({
            input: texts.slice(i, i + BATCH),
            model: this.model,
            input_type: inputType,
            output_dimension: EMBEDDING_DIMENSIONS,
          }),
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
        },
      );
      if (!response.ok) throw new Error(`Voyage embeddings failed: ${response.status}`);
      const data = (await response.json()) as { data: { embedding: number[]; index: number }[] };
      for (const row of [...data.data].sort((a, b) => a.index - b.index)) out.push(row.embedding);
    }
    return out;
  }
}
