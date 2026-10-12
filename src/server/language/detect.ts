import type { GuestLanguage } from "./codes";

export type DetectionResult = {
  language: GuestLanguage;
  /** "high": script makes it unambiguous; "low": guessed (caller may refine). */
  confidence: "high" | "low";
};

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/g;
const KANA = /[぀-ゟ゠-ヿㇰ-ㇿｦ-ﾟ]/g;
const HAN = /[㐀-䶿一-鿿豈-﫿]/g;
const LATIN = /[A-Za-z]/g;

// Common characters that differ between Simplified and Traditional Chinese.
const SIMPLIFIED = new Set(
  "这们说么时间为发对会个来过还吗东车门问号应样让订预价钱饭馆场机长开关请谢没页书买卖热电视话营业预约办楼层边气务网络钥匙泳览游戏惯厅购让热钟点里",
);
const TRADITIONAL = new Set(
  "這們說麼時間為發對會個來過還嗎東車門問號應樣讓訂預價錢飯館場機長開關請謝沒頁書買賣熱電視話營業預約辦樓層邊氣務網絡鑰匙泳覽遊戲慣廳購鐘點裡",
);

function count(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

function chineseVariant(text: string): DetectionResult {
  let simplified = 0;
  let traditional = 0;
  for (const ch of text) {
    if (SIMPLIFIED.has(ch)) simplified++;
    if (TRADITIONAL.has(ch)) traditional++;
  }
  if (traditional > simplified) return { language: "zh-TW", confidence: "high" };
  if (simplified > traditional) return { language: "zh-CN", confidence: "high" };
  return { language: "zh-CN", confidence: "low" };
}

/**
 * Script-based language detection for the five supported guest languages.
 * Deterministic and free; ambiguous cases are marked `low` so the caller can
 * fall back to the previous conversation language or an LLM.
 */
export function detectLanguageHeuristic(text: string): DetectionResult | null {
  const hangul = count(text, HANGUL);
  const kana = count(text, KANA);
  const han = count(text, HAN);
  const latin = count(text, LATIN);

  if (hangul === 0 && kana === 0 && han === 0 && latin === 0) return null;

  if (hangul > 0 && hangul >= kana) return { language: "ko", confidence: "high" };
  if (kana > 0) return { language: "ja", confidence: "high" };
  if (han > 0) {
    const result = chineseVariant(text);
    // Short Han-only text could be Japanese kanji ("大浴場"), so stay humble.
    return han < 4 ? { ...result, confidence: "low" } : result;
  }
  // Latin script: we only support English among Latin-script languages.
  return { language: "en", confidence: latin >= 3 ? "high" : "low" };
}
