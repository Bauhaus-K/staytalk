import { describe, expect, it } from "vitest";
import { apiTools } from "./tools";
import { buildSystemPrompt, extractSources, STATIC_INSTRUCTIONS } from "./system-prompt";

const property = {
  name: "Test <Inn>",
  country: "JP" as const,
  address: "Fukuoka",
  timezone: "Asia/Tokyo",
  defaultLanguage: "ja",
  staffLanguage: "ja",
  checkInTime: "15:00",
  checkOutTime: "10:00",
  phone: null,
  currency: "JPY",
};
const knowledge = [
  {
    id: "k1",
    category: "CHECKIN" as const,
    question: "チェックイン",
    content: "15:00〜",
    language: "ja",
  },
];

describe("buildSystemPrompt", () => {
  const build = (now: Date, guestLanguage: "ko" | "en" = "ko") =>
    buildSystemPrompt({ property, roomTypes: [], knowledge, guestLanguage, now });

  it("orders static → property (cached) → conversation", () => {
    const blocks = build(new Date("2026-10-12T00:00:00Z"));
    expect(blocks).toHaveLength(3);
    expect(blocks[0]!.text).toBe(STATIC_INSTRUCTIONS);
    expect(blocks[0]!.cache_control).toBeUndefined();
    expect(blocks[1]!.cache_control).toEqual({ type: "ephemeral" });
    expect(blocks[1]!.text).toContain('<item id="k1" category="CHECKIN" language="ja">');
    expect(blocks[2]!.cache_control).toBeUndefined();
    expect(blocks[2]!.text).toContain("guest_language: Korean (ko)");
    expect(blocks[2]!.text).toContain("2026-10-12");
  });

  it("keeps the cached prefix byte-identical across time and guest language", () => {
    const a = build(new Date("2026-10-12T00:00:00Z"), "ko");
    const b = build(new Date("2026-11-30T12:34:00Z"), "en");
    expect(a.slice(0, 2)).toEqual(b.slice(0, 2));
    expect(a[2]).not.toEqual(b[2]);
  });

  it("escapes markup in property data", () => {
    expect(build(new Date())[1]!.text).toContain("Test &lt;Inn&gt;");
  });
});

describe("extractSources", () => {
  it("strips all sources tags and keeps only known ids", () => {
    expect(
      extractSources(
        "A <sources>x</sources>B\n<sources>k1, k2 ,k1</sources>",
        new Set(["k1", "k2"]),
      ),
    ).toEqual({
      text: "A B",
      citedIds: ["k1", "k2"],
    });
  });
});

describe("apiTools", () => {
  it("produces strict schemas without unsupported keywords", () => {
    const tools = apiTools();
    expect(tools.map((t) => t.name)).toEqual([
      "search_knowledge",
      "check_availability",
      "create_booking_request",
      "get_booking_request_status",
      "escalate_to_human",
    ]);
    for (const tool of tools) {
      expect(tool.strict).toBe(true);
      const json = JSON.stringify(tool.input_schema);
      expect(json).not.toMatch(/minLength|maxLength|\$schema/);
      expect(tool.input_schema).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
});
