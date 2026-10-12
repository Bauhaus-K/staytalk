import { describe, expect, it } from "vitest";
import { EMAIL_MASK, PHONE_MASK, maskContact } from "./contact";

describe("maskContact", () => {
  it.each([
    ["mail me at alex.kim+stay@example.co.jp please", `mail me at ${EMAIL_MASK} please`],
    ["010-1234-5678로 연락주세요", `${PHONE_MASK}로 연락주세요`],
    ["電話番号は090-1234-5678です", `電話番号は${PHONE_MASK}です`],
    ["call +81 90 1234 5678", `call ${PHONE_MASK}`],
    ["+82 10 1234 5678", PHONE_MASK],
  ])("%s", (input, expected) => {
    expect(maskContact(input).text).toBe(expected);
  });

  it.each([
    "2026-11-20 to 2026-11-22",
    "총 196,000원입니다",
    "Room 302, 2 guests",
    "예약번호 ABC123",
  ])("leaves %s alone", (input) => {
    expect(maskContact(input)).toEqual({ text: input, masked: false });
  });
});
