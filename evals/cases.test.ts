import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evalFileSchema } from "./schema";

const dir = path.join(import.meta.dirname, "cases");

describe("eval cases", () => {
  const cases = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => evalFileSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))));

  it("are valid, unique and cover the required mix", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    const categories = new Set(cases.map((c) => c.category));
    for (const c of [
      "faq",
      "unknown",
      "booking",
      "complaint",
      "refund",
      "emergency",
      "injection",
      "pii",
    ]) {
      expect(categories.has(c as never), c).toBe(true);
    }
    const languages = new Set(cases.map((c) => c.expect.language));
    for (const l of ["ko", "ja", "en", "zh-CN", "zh-TW"])
      expect(languages.has(l as never), l).toBe(true);
  });
});
