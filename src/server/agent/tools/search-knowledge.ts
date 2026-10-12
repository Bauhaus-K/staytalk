import { z } from "zod";
import { KNOWLEDGE_CATEGORIES, searchKnowledge } from "@/server/services/knowledge";
import { defineTool } from "./types";

export const searchKnowledgeTool = defineTool({
  name: "search_knowledge",
  description:
    "Search this property's knowledge base (house rules, check-in, facilities, transport, nearby places, FAQ, policies). " +
    "The knowledge base is also included in the system prompt; use this tool to look up an item by keywords when you are " +
    "not sure it exists. Write the query as 1-4 short keywords in the knowledge base's language (the property's default " +
    "language), not as a full sentence. Returns matching items with their ids; an empty list means nothing relevant exists.",
  schema: z.object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("Short keywords in the knowledge base language"),
    category: z.enum(KNOWLEDGE_CATEGORIES).optional().describe("Optional category filter"),
  }),
  async run(input, ctx) {
    const hits = await searchKnowledge(
      ctx.client,
      {
        organizationId: ctx.organizationId,
        propertyId: ctx.property.id,
        query: input.query,
        category: input.category,
      },
      { embedder: ctx.embedder },
    );
    return {
      items: hits.map((h) => ({
        id: h.id,
        category: h.category,
        title: h.question,
        content: h.content,
        score: Math.round(h.score * 100) / 100,
      })),
    };
  },
});
