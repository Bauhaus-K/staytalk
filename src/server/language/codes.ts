export const GUEST_LANGUAGES = ["ko", "ja", "en", "zh-CN", "zh-TW"] as const;
export type GuestLanguage = (typeof GUEST_LANGUAGES)[number];

export function isGuestLanguage(value: unknown): value is GuestLanguage {
  return typeof value === "string" && (GUEST_LANGUAGES as readonly string[]).includes(value);
}

/** English names, used inside prompts. */
export const LANGUAGE_NAMES: Record<GuestLanguage, string> = {
  ko: "Korean",
  ja: "Japanese",
  en: "English",
  "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese",
};

/** Native names, used in UI. */
export const LANGUAGE_NATIVE_NAMES: Record<GuestLanguage, string> = {
  ko: "한국어",
  ja: "日本語",
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};
