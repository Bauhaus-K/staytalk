import { EMBEDDING_DIMENSIONS, type Embedder, type EmbeddingInputType } from "./types";

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Local, dependency-free embedding: character 2/3-grams hashed into 1024
 * signed buckets. Captures lexical overlap (works for unspaced CJK text) but
 * has no semantic or cross-language understanding — a baseline and a
 * test/offline fallback, not a replacement for a real embedding model.
 */
export class HashEmbedder implements Embedder {
  readonly model = "hash-ngram-v1";

  // Symmetric model: documents and queries are embedded the same way.
  async embed(texts: string[], _inputType?: EmbeddingInputType): Promise<number[][]> {
    return texts.map((text) => this.vector(text));
  }

  private vector(text: string): number[] {
    const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    const normalized = ` ${text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()} `;
    for (const n of [2, 3]) {
      for (let i = 0; i + n <= normalized.length; i++) {
        const gram = normalized.slice(i, i + n);
        if (gram.trim().length === 0) continue;
        const h = fnv1a(gram);
        v[h % EMBEDDING_DIMENSIONS]! += h & 0x80000000 ? -1 : 1;
      }
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  }
}
