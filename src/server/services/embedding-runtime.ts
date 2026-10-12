import "server-only";
import { after } from "next/server";
import { prisma } from "@/server/db/client";
import { getEmbedder } from "@/server/embeddings";
import { embedKnowledge } from "./knowledge-embeddings";

/** Refreshes a property's knowledge vectors after the response (if semantic search is enabled). */
export function scheduleEmbedding(organizationId: string, propertyId: string) {
  const embedder = getEmbedder();
  if (!embedder) return;
  after(() =>
    embedKnowledge(prisma, embedder, { organizationId, propertyId }).catch((error) =>
      console.error("[embeddings] refresh failed", error),
    ),
  );
}
