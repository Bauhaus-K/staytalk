/**
 * Detects and masks payment card and passport numbers in guest messages.
 * We never want these stored or sent to the LLM.
 */

export const CARD_MASK = "[REDACTED_CARD]";
export const PASSPORT_MASK = "[REDACTED_PASSPORT]";

export type MaskResult = {
  text: string;
  masked: boolean;
  kinds: ("card" | "passport")[];
};

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// 13–19 digits, optionally grouped with spaces or dashes.
const CARD_CANDIDATE = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;

// Korean (M/S/R/O/D + 8 digits or 1 letter + 3 digits + 1 letter + 4 digits),
// Japanese (2 letters + 7 digits), and other common 1–2 letter + 6–8 digit formats.
const PASSPORT_PATTERN =
  /(?<![A-Za-z0-9])[A-Za-z]{1,2}\d{6,8}(?![A-Za-z0-9])|(?<![A-Za-z0-9])[MSRODmsrod]\d{3}[A-Za-z]\d{4}(?![A-Za-z0-9])/g;

// A bare letter+digits token is only treated as a passport number near a
// passport keyword, to avoid masking booking codes and room numbers.
const PASSPORT_KEYWORDS = /passport|여권|旅券|パスポート|护照|護照|pasaporte|passeport/i;

export function maskPii(input: string): MaskResult {
  const kinds = new Set<"card" | "passport">();

  let text = input.replace(CARD_CANDIDATE, (match) => {
    const digits = match.replace(/[ -]/g, "");
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) return match;
    kinds.add("card");
    return CARD_MASK;
  });

  if (PASSPORT_KEYWORDS.test(text)) {
    text = text.replace(PASSPORT_PATTERN, () => {
      kinds.add("passport");
      return PASSPORT_MASK;
    });
  }

  return { text, masked: kinds.size > 0, kinds: [...kinds] };
}
