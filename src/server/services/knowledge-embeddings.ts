import { Prisma } from "@/generated/prisma/client";
import type { DbClient } from "@/server/db/client";
import type { Embedder } from "@/server/embeddings";

const toVector = (v: number[]) => `[${v.join(",")}]`;

/** Text that represents a knowledge item for embedding. */
export function knowledgeText(item: { question: string; content: string }) {
  return `${item.question}\n${item.content}`;
}

/**
 * (Re)embeds knowledge items whose vector is missing, stale or from another
 * model. Scoped by organization (and optionally property / ids).
 */
export async function embedKnowledge(
  client: DbClient,
  embedder: Embedder,
  scope: { organizationId: string; propertyId?: string; ids?: string[] },
) {
  const items = await client.knowledgeItem.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(scope.propertyId ? { propertyId: scope.propertyId } : {}),
      ...(scope.ids ? { id: { in: scope.ids } } : {}),
      OR: [{ embeddingModel: null }, { embeddingModel: { not: embedder.model } }],
    },
    select: { id: true, question: true, content: true },
  });
  if (!items.length) return { embedded: 0 };
  const vectors = await embedder.embed(items.map(knowledgeText), "document");
  for (const [i, item] of items.entries()) {
    await client.$executeRaw`
      UPDATE "KnowledgeItem"
      SET embedding = ${toVector(vectors[i]!)}::vector, "embeddingModel" = ${embedder.model}
      WHERE id = ${item.id} AND "organizationId" = ${scope.organizationId}`;
  }
  return { embedded: items.length };
}

/** Embeds every tenant's knowledge (batch job / backfill). */
export async function embedAllKnowledge(client: DbClient, embedder: Embedder | null) {
  if (!embedder) return { embedded: 0, skipped: "no embedding provider configured" };
  const orgs = await client.organization.findMany({ select: { id: true } });
  let embedded = 0;
  for (const org of orgs)
    embedded += (await embedKnowledge(client, embedder, { organizationId: org.id })).embedded;
  return { embedded };
}

export type VectorHit = { id: string; similarity: number };

/** Exact cosine-similarity search over a property's embedded, active items. */
export async function vectorSearch(
  client: DbClient,
  embedder: Embedder,
  params: {
    organizationId: string;
    propertyId: string;
    query: string;
    limit: number;
    category?: string;
  },
): Promise<VectorHit[]> {
  const [vector] = await embedder.embed([params.query], "query");
  const categoryFilter = params.category
    ? Prisma.sql`AND "category" = ${params.category}::"KnowledgeCategory"`
    : Prisma.empty;
  return client.$queryRaw<VectorHit[]>`
    SELECT id, (1 - (embedding <=> ${toVector(vector!)}::vector))::float8 AS similarity
    FROM "KnowledgeItem"
    WHERE "organizationId" = ${params.organizationId}
      AND "propertyId" = ${params.propertyId}
      AND active = true
      AND "embeddingModel" = ${embedder.model}
      ${categoryFilter}
    ORDER BY embedding <=> ${toVector(vector!)}::vector
    LIMIT ${params.limit}`;
}
