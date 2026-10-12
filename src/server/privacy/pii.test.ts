import { describe, expect, it } from "vitest";
import { CARD_MASK, PASSPORT_MASK, maskPii } from "./pii";

describe("maskPii", () => {
  it("masks Luhn-valid card numbers in any grouping", () => {
    for (const card of ["4111111111111111", "4111 1111 1111 1111", "4111-1111-1111-1111"]) {
      const r = maskPii(`카드번호는 ${card} 입니다`);
      expect(r.text).toBe(`카드번호는 ${CARD_MASK} 입니다`);
      expect(r.kinds).toEqual(["card"]);
    }
  });

  it("does not mask phone numbers or Luhn-invalid digit runs", () => {
    expect(maskPii("010-1234-5678로 연락주세요").masked).toBe(false);
    expect(maskPii("+81 90 1234 5678").masked).toBe(false);
    expect(maskPii("4111 1111 1111 1112").masked).toBe(false);
  });

  it("masks passport numbers only when a passport keyword is present", () => {
    const r = maskPii("My passport number is M12345678");
    expect(r.text).toBe(`My passport number is ${PASSPORT_MASK}`);
    expect(maskPii("パスポート番号はTK1234567です").text).toContain(PASSPORT_MASK);
    expect(maskPii("여권번호 M123A4567").text).toContain(PASSPORT_MASK);
    expect(maskPii("Booking code AB123456").masked).toBe(false);
  });

  it("leaves ordinary text untouched", () => {
    const r = maskPii("체크인은 몇 시인가요? 2명이고 3박 예정이에요.");
    expect(r).toEqual({
      text: "체크인은 몇 시인가요? 2명이고 3박 예정이에요.",
      masked: false,
      kinds: [],
    });
  });
});
