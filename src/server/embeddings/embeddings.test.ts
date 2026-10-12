import { describe, expect, it, vi } from "vitest";
import { HashEmbedder } from "./hash";
import { EMBEDDING_DIMENSIONS } from "./types";
import { VoyageEmbedder } from "./voyage";

const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

describe("HashEmbedder", () => {
  it("returns normalized 1024-d vectors that reflect lexical overlap (incl. unspaced CJK)", async () => {
    const e = new HashEmbedder();
    const [q, related, unrelated] = await e.embed(
      ["大浴場の時間", "大浴場（温泉）の利用時間", "駐車場は2台分"],
      "query",
    );
    expect(q).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(Math.hypot(...q!)).toBeCloseTo(1, 6);
    expect(cosine(q!, related!)).toBeGreaterThan(cosine(q!, unrelated!));
  });
});

describe("VoyageEmbedder", () => {
  it("sends documents/queries with the right input type and dimension, preserving order", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          data: body.input
            .map((_: string, i: number) => ({ index: body.input.length - 1 - i, embedding: [i] }))
            .reverse(),
        }),
        { status: 200 },
      );
    });
    const e = new VoyageEmbedder({ apiKey: "k", fetch: fetchMock as unknown as typeof fetch });
    const out = await e.embed(["a", "b"], "query");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    expect(JSON.parse(String(init.body))).toMatchObject({
      input: ["a", "b"],
      model: "voyage-3.5",
      input_type: "query",
      output_dimension: 1024,
    });
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
    expect(out).toHaveLength(2);
  });

  it("throws on API errors", async () => {
    const e = new VoyageEmbedder({
      apiKey: "k",
      fetch: (async () => new Response("no", { status: 401 })) as unknown as typeof fetch,
    });
    await expect(e.embed(["a"], "document")).rejects.toThrow("401");
  });
});
