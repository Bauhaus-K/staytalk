/**
 * Rule-based booking helpers for the mock LLM: date / party-size / room /
 * contact extraction from guest text. Deliberately simple — the real model
 * does this with language understanding.
 */
import { addDays, parseIsoDate, toIsoDate } from "@/lib/dates";

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  一: 1,
  两: 2,
  兩: 2,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  한: 1,
  두: 2,
  세: 3,
  네: 4,
};

function num(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  return NUMBER_WORDS[value.toLowerCase()] ?? null;
}

type MonthDay = { month: number; day: number; year?: number };

/** Month/day mentions in order of appearance (plus "to 22" style end days). */
function monthDays(text: string): MonthDay[] {
  const found: { index: number; md: MonthDay }[] = [];
  const add = (index: number, md: MonthDay) => found.push({ index, md });

  for (const m of text.matchAll(/(\d{4})-(\d{1,2})-(\d{1,2})/g)) {
    add(m.index!, { year: +m[1]!, month: +m[2]!, day: +m[3]! });
  }
  for (const m of text.matchAll(/(?<![\d-])(\d{1,2})\/(\d{1,2})(?![\d/])/g)) {
    add(m.index!, { month: +m[1]!, day: +m[2]! });
  }
  for (const m of text.matchAll(/(\d{1,2})\s*(?:月|월)\s*(\d{1,2})\s*(?:日|일|号|號)?/g)) {
    add(m.index!, { month: +m[1]!, day: +m[2]! });
  }
  for (const m of text.matchAll(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi,
  )) {
    add(m.index!, { month: MONTHS[m[1]!.toLowerCase()]!, day: +m[2]! });
  }
  for (const m of text.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi,
  )) {
    add(m.index!, { month: MONTHS[m[2]!.toLowerCase()]!, day: +m[1]! });
  }
  found.sort((a, b) => a.index - b.index);
  const result = found.map((f) => f.md);

  // "November 20 to 22", "11月20日〜22日", "20일부터 22일까지"
  if (result.length === 1) {
    const end = text.match(
      /(?:to|until|till|-|~|〜|～|부터)\s*(\d{1,2})(?:st|nd|rd|th|日|일|号|號)?(?![\d/月월])/i,
    );
    if (end) result.push({ month: result[0]!.month, day: +end[1]!, year: result[0]!.year });
  }
  return result;
}

function resolveDate(md: MonthDay, today: Date): Date | null {
  let year = md.year ?? today.getUTCFullYear();
  let date = parseIsoDate(
    `${year}-${String(md.month).padStart(2, "0")}-${String(md.day).padStart(2, "0")}`,
  );
  if (date && !md.year && date < today) {
    year += 1;
    date = parseIsoDate(
      `${year}-${String(md.month).padStart(2, "0")}-${String(md.day).padStart(2, "0")}`,
    );
  }
  return date;
}

function nightsIn(text: string): number | null {
  const m = text.match(
    /(\d+|one|two|three|four|five|six|[一两兩二三四五六]|[한두세네])\s*(?:박|泊|nights?|晚)/i,
  );
  return num(m?.[1]);
}

export function guestsIn(text: string): number | null {
  const m = text.match(
    /(\d+|one|two|three|four|five|six|[一两兩二三四五六]|[한두세네])\s*(?:명|人|名|個人|个人|people|persons?|guests?|adults?|pax)/i,
  );
  return num(m?.[1]);
}

export type StayGuess = { checkIn: string; checkOut: string } | null;

/** Dates of the stay from guest texts (latest message first). */
export function stayIn(texts: string[], today: Date): StayGuess {
  for (const text of texts) {
    const mds = monthDays(text);
    if (!mds.length) continue;
    const checkIn = resolveDate(mds[0]!, today);
    if (!checkIn) continue;
    let checkOut = mds[1]
      ? resolveDate({ ...mds[1], year: mds[1].year ?? checkIn.getUTCFullYear() }, today)
      : null;
    if (checkOut && checkOut <= checkIn) checkOut = null;
    if (!checkOut) checkOut = addDays(checkIn, nightsIn(text) ?? nightsIn(texts.join(" ")) ?? 1);
    return { checkIn: toIsoDate(checkIn), checkOut: toIsoDate(checkOut) };
  }
  return null;
}

export type PromptRoom = { id: string; capacity: number; names: string[] };

/** Room types listed in the system prompt's <property> block. */
export function roomsFromSystem(system: string): PromptRoom[] {
  return [...system.matchAll(/<room_type id="([^"]+)" capacity="(\d+)">([^<]*)<\/room_type>/g)].map(
    (m) => ({
      id: m[1]!,
      capacity: +m[2]!,
      names: m[3]!
        .split(" — ")[0]!
        .split(" / ")
        .map((part) => part.replace(/^[a-zA-Z-]+:\s*/, "")),
    }),
  );
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2 || /\d/.test(t));
}

/** Best-matching room type for the guest's wording, else the first that fits. */
export function pickRoom(rooms: PromptRoom[], text: string, guests: number): PromptRoom | null {
  const words = new Set(tokens(text));
  const lower = text.toLowerCase();
  let best: { room: PromptRoom; score: number } | null = null;
  for (const room of rooms) {
    if (room.capacity < guests) continue;
    const score = Math.max(
      ...room.names.map((name) => {
        const nameTokens = tokens(name);
        const hits = nameTokens.filter(
          (t) => words.has(t) || (t.length >= 2 && lower.includes(t)),
        ).length;
        return lower.includes(name.toLowerCase()) ? hits + 10 : hits;
      }),
    );
    if (!best || score > best.score) best = { room, score };
  }
  if (best && best.score > 0) return best.room;
  return rooms.find((r) => r.capacity >= guests) ?? null;
}

export function contactIn(text: string): string | null {
  return (
    text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ??
    text.match(/\+?\d(?:[\s().-]?\d){8,14}/)?.[0] ??
    null
  );
}

export function nameIn(text: string): string | null {
  const m =
    text.match(/my name is ([A-Za-z][A-Za-z .'-]{1,40}?)(?:[,.]|\s+(?:and|email|phone|my)\b|$)/i) ??
    text.match(/이름은\s*([^\s,.]{1,20})/) ??
    text.match(/名前は\s*([^\s,、。]{1,20}?)(?:です|、|,|\s|$)/) ??
    text.match(/我叫\s*([^\s,，。]{1,20})/);
  return m?.[1]?.trim() ?? null;
}

export function todayFromSystem(system: string): Date {
  const m = system.match(/property_local_time: [^\n]*?(\d{4}-\d{2}-\d{2})/);
  return (m && parseIsoDate(m[1]!)) || parseIsoDate(new Date().toISOString().slice(0, 10))!;
}
