import { describe, expect, it } from "vitest";
import { detectEmergency } from "./emergency";

describe("detectEmergency", () => {
  it.each([
    "There's smoke coming from the kitchen!",
    "My friend collapsed and is not breathing",
    "방에서 불이 났어요",
    "친구가 쓰러졌어요 구급차 불러주세요",
    "部屋で火事です！",
    "友人が倒れて意識がないです",
    "朋友晕倒了，请叫救护车",
    "房間著火了，救命",
    "子どもが高熱でけいれんしています",
    "아이가 열이 나고 경련을 해요",
  ])("detects: %s", (text) => {
    expect(detectEmergency(text)).toBe(true);
  });

  it.each([
    "What time is check-in?",
    "불고기 맛집 추천해주세요",
    "大浴場は何時までですか",
    "Is there a fire extinguisher in the room?",
    "Where is the emergency exit?",
  ])("ignores: %s", (text) => {
    expect(detectEmergency(text)).toBe(false);
  });
});
