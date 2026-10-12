/**
 * Masks e-mail addresses and phone numbers. Guest contact details belong in
 * BookingRequest only, so they are masked before messages are stored; the
 * model sees the original only for the turn in which it was sent.
 */
export const EMAIL_MASK = "[REDACTED_EMAIL]";
export const PHONE_MASK = "[REDACTED_PHONE]";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// +country and/or grouped digits; 9–15 digits total. Commas are excluded so
// prices ("98,000") never match; ISO dates have too few digits.
const PHONE = /(?<![\w+])\+?\d(?:[\s().-]?\d){8,14}(?![\w])/g;

export function maskContact(text: string): { text: string; masked: boolean } {
  let masked = false;
  const out = text
    .replace(EMAIL, () => {
      masked = true;
      return EMAIL_MASK;
    })
    .replace(PHONE, (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length < 9 || digits.length > 15) return match;
      masked = true;
      return PHONE_MASK;
    });
  return { text: out, masked };
}
