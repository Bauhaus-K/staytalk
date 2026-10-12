import { beforeAll, describe, expect, it } from "vitest";
import { searchKnowledge } from "@/server/services/knowledge";
import { seedDemo } from "../prisma/seed/seed";
import { testDb } from "./db";

const client = testDb();
let seoul: { organizationId: string; propertyId: string };
let fukuoka: { organizationId: string; propertyId: string };

beforeAll(async () => {
  const [s, f] = await seedDemo(client);
  seoul = { organizationId: s!.organizationId, propertyId: s!.id };
  fukuoka = { organizationId: f!.organizationId, propertyId: f!.id };
});

describe("searchKnowledge", () => {
  it.each([
    ["seoul", "와이파이", "와이파이"],
    ["seoul", "짐 보관", "짐 보관"],
    ["seoul", "인천공항", "인천공항에서 오는 방법"],
    ["fukuoka", "空港", "福岡空港からのアクセス"],
    ["fukuoka", "大浴場", "大浴場（温泉）の利用時間"],
    ["fukuoka", "タトゥー", "タトゥー（入れ墨）"],
    ["fukuoka", "屋台", "中洲の屋台"],
  ] as const)("%s: %s → %s", async (which, query, expectedTitle) => {
    const hits = await searchKnowledge(client, { ...(which === "seoul" ? seoul : fukuoka), query });
    expect(hits[0]?.question).toBe(expectedTitle);
    expect(hits[0]!.score).toBeGreaterThanOrEqual(0.3);
  });

  it("returns nothing relevant for absent topics", async () => {
    const hits = await searchKnowledge(client, { ...seoul, query: "수영장" });
    expect(hits.every((h) => h.score < 0.3)).toBe(true);
  });

  it("filters by category and never crosses tenants", async () => {
    const hits = await searchKnowledge(client, { ...seoul, query: "체크인", category: "POLICY" });
    expect(hits.every((h) => h.category === "POLICY")).toBe(true);
    const cross = await searchKnowledge(client, {
      organizationId: seoul.organizationId,
      propertyId: fukuoka.propertyId,
      query: "空港",
    });
    expect(cross).toEqual([]);
  });
});
