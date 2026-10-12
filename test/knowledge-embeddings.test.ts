import { beforeAll, describe, expect, it } from "vitest";
import { forOrg } from "@/server/db/tenant";
import { HashEmbedder } from "@/server/embeddings/hash";
import { searchKnowledge } from "@/server/services/knowledge";
import { embedKnowledge, vectorSearch } from "@/server/services/knowledge-embeddings";
import { seedDemo } from "../prisma/seed/seed";
import { testDb } from "./db";

const client = testDb();
const embedder = new HashEmbedder();
const ORG = "org_demo_fukuoka";
let propertyId: string;

beforeAll(async () => {
  const [, fukuoka] = await seedDemo(client);
  propertyId = fukuoka!.id;
});

describe("knowledge embeddings", () => {
  it("embeds missing items once and re-embeds stale ones", async () => {
    expect((await embedKnowledge(client, embedder, { organizationId: ORG })).embedded).toBe(20);
    expect((await embedKnowledge(client, embedder, { organizationId: ORG })).embedded).toBe(0);
    const item = await forOrg(ORG, client).knowledgeItem.findFirstOrThrow({
      where: { propertyId },
    });
    await forOrg(ORG, client).knowledgeItem.update({
      where: { id: item.id },
      data: { embeddingModel: null },
    });
    expect((await embedKnowledge(client, embedder, { organizationId: ORG })).embedded).toBe(1);
  });

  it("vector and hybrid search rank the relevant item first and stay within the tenant", async () => {
    const hits = await vectorSearch(client, embedder, {
      organizationId: ORG,
      propertyId,
      query: "大浴場は何時まで",
      limit: 3,
    });
    const top = await forOrg(ORG, client).knowledgeItem.findUniqueOrThrow({
      where: { id: hits[0]!.id },
    });
    expect(top.question).toContain("大浴場");

    const hybrid = await searchKnowledge(
      client,
      { organizationId: ORG, propertyId, query: "屋台" },
      { embedder, mode: "hybrid" },
    );
    expect(hybrid[0]?.question).toBe("中洲の屋台");

    const cross = await vectorSearch(client, embedder, {
      organizationId: "org_demo_seoul",
      propertyId,
      query: "大浴場",
      limit: 3,
    });
    expect(cross).toEqual([]);
  });
});
