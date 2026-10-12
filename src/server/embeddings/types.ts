export const EMBEDDING_DIMENSIONS = 1024;

export type EmbeddingInputType = "document" | "query";

/** Text → vector provider for knowledge search. Vectors are L2-normalised. */
export interface Embedder {
  /** Stored with each vector; rows embedded by another model are ignored. */
  readonly model: string;
  embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]>;
}
