import { describe, expect, it } from "vitest";
import { detectLanguageHeuristic } from "./detect";

describe("detectLanguageHeuristic", () => {
  it.each([
    ["체크인은 몇 시부터인가요?", "ko"],
    ["チェックインは何時からですか？", "ja"],
    ["What time is check-in?", "en"],
    ["请问几点可以办理入住？", "zh-CN"],
    ["請問幾點可以辦理入住？", "zh-TW"],
    ["Wi-Fi 비밀번호 알려주세요", "ko"],
    ["Wi-Fiのパスワードを教えてください", "ja"],
  ])("%s → %s", (text, expected) => {
    const result = detectLanguageHeuristic(text);
    expect(result?.language).toBe(expected);
    expect(result?.confidence).toBe("high");
  });

  it("marks short Han-only text as low confidence", () => {
    expect(detectLanguageHeuristic("大浴場")?.confidence).toBe("low");
  });

  it("returns null for text without letters", () => {
    expect(detectLanguageHeuristic("👍 123")).toBeNull();
  });

  it("marks very short latin text as low confidence", () => {
    expect(detectLanguageHeuristic("ok")).toEqual({ language: "en", confidence: "low" });
  });
});
