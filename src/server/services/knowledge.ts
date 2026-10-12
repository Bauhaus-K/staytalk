import { Prisma } from "@/generated/prisma/client";
import type { KnowledgeCategory } from "@/generated/prisma/enums";
import { z } from "zod";
import type { DbClient } from "@/server/db/client";
import type { TenantDb } from "@/server/db/tenant";
import { GUEST_LANGUAGES } from "@/server/language/codes";
import type { Embedder } from "@/server/embeddings";
import { vectorSearch } from "./knowledge-embeddings";

export const KNOWLEDGE_CATEGORIES = [
  "HOUSE_RULES",
  "CHECKIN",
  "FACILITY",
  "TRANSPORT",
  "NEARBY",
  "FAQ",
  "POLICY",
] as const satisfies readonly KnowledgeCategory[];

export const knowledgeInputSchema = z.object({
  propertyId: z.string().min(1),
  category: z.enum(KNOWLEDGE_CATEGORIES),
  question: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(4000),
  language: z.enum(GUEST_LANGUAGES),
  active: z.boolean().default(true),
});
export type KnowledgeInput = z.infer<typeof knowledgeInputSchema>;

export type KnowledgeHit = {
  id: string;
  category: KnowledgeCategory;
  question: string;
  content: string;
  language: string;
  score: number;
};

/** Minimum trigram score for a hit to be returned at all. */
const MIN_SCORE = 0.15;

function queryTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .split(/[\s,.!?;:、。！？，（）()「」『』"'“”・·/]+/u)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2),
    ),
  ].slice(0, 8);
}

/**
 * Trigram + substring search over a property's active knowledge items
 * (pg_trgm handles CJK characters, unlike Postgres' built-in full-text
 * configs; substring matching covers unspaced Japanese/Chinese text). Raw SQL bypasses the
 * tenant extension, so organizationId is applied explicitly here.
 */
async function trigramSearch(
  client: DbClient,
  params: {
    organizationId: string;
    propertyId: string;
    query: string;
    category?: KnowledgeCategory;
    limit?: number;
  },
): Promise<KnowledgeHit[]> {
  const query = params.query.trim().slice(0, 200);
  if (!query) return [];
  const terms = queryTerms(query);
  const termArray = terms.length ? terms : [query];
  const limit = Math.min(params.limit ?? 5, 10);
  const categoryFilter = params.category
    ? Prisma.sql`AND "category" = ${params.category}::"KnowledgeCategory"`
    : Prisma.empty;

  const rows = await client.$queryRaw<KnowledgeHit[]>`
    SELECT id, category, question, content, language, score FROM (
      SELECT id, category, question, content, language, "createdAt",
        GREATEST(
          word_similarity(${query}, question),
          word_similarity(${query}, content) * 0.9,
          (SELECT avg(GREATEST(
              word_similarity(t, question),
              word_similarity(t, content) * 0.9,
              -- Substring match: pg_trgm pads trigrams at word boundaries, so a
              -- term inside an unspaced Japanese/Chinese run ("福岡空港から")
              -- scores 0 on trigrams alone.
              CASE WHEN strpos(lower(question), lower(t)) > 0 THEN 1.0
                   WHEN strpos(lower(content), lower(t)) > 0 THEN 0.8
                   ELSE 0 END
            ))
            FROM unnest(${termArray}::text[]) AS t)
        )::float8 AS score
      FROM "KnowledgeItem"
      WHERE "organizationId" = ${params.organizationId}
        AND "propertyId" = ${params.propertyId}
        AND active = true
        ${categoryFilter}
    ) scored
    WHERE score >= ${MIN_SCORE}
    ORDER BY score DESC, "createdAt" ASC
    LIMIT ${limit}
  `;
  return rows;
}

export type SearchMode = "trigram" | "vector" | "hybrid";

/**
 * Knowledge search used by the agent. Trigram by default; with an embedder,
 * "hybrid" merges trigram and vector hits (score = max of trigram score and
 * cosine similarity), "vector" uses embeddings only.
 */
export async function searchKnowledge(
  client: DbClient,
  params: Parameters<typeof trigramSearch>[1],
  options: { embedder?: Embedder | null; mode?: SearchMode } = {},
): Promise<KnowledgeHit[]> {
  const embedder = options.embedder ?? null;
  const mode: SearchMode = options.mode ?? (embedder ? "hybrid" : "trigram");
  if (mode === "trigram" || !embedder) return trigramSearch(client, params);

  const limit = Math.min(params.limit ?? 5, 10);
  const [lexical, semantic] = await Promise.all([
    mode === "hybrid" ? trigramSearch(client, { ...params, limit: 10 }) : Promise.resolve([]),
    vectorSearch(client, embedder, { ...params, limit: 10 }),
  ]);
  const scores = new Map<string, number>();
  for (const h of lexical) scores.set(h.id, h.score);
  for (const h of semantic) scores.set(h.id, Math.max(scores.get(h.id) ?? 0, h.similarity));
  const ids = [...scores.keys()];
  if (!ids.length) return [];
  const rows = await client.knowledgeItem.findMany({
    where: {
      id: { in: ids },
      organizationId: params.organizationId,
      propertyId: params.propertyId,
    },
    select: { id: true, category: true, question: true, content: true, language: true },
  });
  return rows
    .map((r) => ({ ...r, score: scores.get(r.id)! }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** All active items for the system prompt, in a stable order (cache-friendly). */
export function listKnowledgeForPrompt(db: TenantDb, propertyId: string) {
  return db.knowledgeItem.findMany({
    where: { propertyId, active: true },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, category: true, question: true, content: true, language: true },
  });
}
