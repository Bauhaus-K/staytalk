import type { GuestLanguage } from "./codes";

export const DECLINE_REASONS = [
  "FULLY_BOOKED",
  "DATES_UNAVAILABLE",
  "GROUP_SIZE",
  "OTHER",
] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export type BookingDetails = {
  reference: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  /** Already formatted, e.g. "₩196,000". */
  total: string | null;
};

type Strings = {
  approved: (d: BookingDetails) => string;
  declined: (d: BookingDetails, reason: DeclineReason) => string;
  expired: (d: BookingDetails) => string;
  staffNote: string;
};

const LOCALE: Record<GuestLanguage, string> = {
  ko: "ko-KR",
  ja: "ja-JP",
  en: "en-US",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
};

export function formatMoney(amount: number, currency: string, language: GuestLanguage): string {
  return new Intl.NumberFormat(LOCALE[language], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

const summary = {
  ko: (d: BookingDetails) =>
    `예약번호 ${d.reference}\n객실: ${d.roomName}\n일정: ${d.checkIn} ~ ${d.checkOut}\n인원: ${d.guests}명${d.total ? `\n요금: ${d.total}` : ""}`,
  ja: (d: BookingDetails) =>
    `予約番号 ${d.reference}\n客室：${d.roomName}\n日程：${d.checkIn}〜${d.checkOut}\n人数：${d.guests}名${d.total ? `\n料金：${d.total}` : ""}`,
  en: (d: BookingDetails) =>
    `Reference ${d.reference}\nRoom: ${d.roomName}\nDates: ${d.checkIn} – ${d.checkOut}\nGuests: ${d.guests}${d.total ? `\nPrice: ${d.total}` : ""}`,
  "zh-CN": (d: BookingDetails) =>
    `预订编号 ${d.reference}\n房型：${d.roomName}\n日期：${d.checkIn} 至 ${d.checkOut}\n人数：${d.guests}人${d.total ? `\n费用：${d.total}` : ""}`,
  "zh-TW": (d: BookingDetails) =>
    `預訂編號 ${d.reference}\n房型：${d.roomName}\n日期：${d.checkIn} 至 ${d.checkOut}\n人數：${d.guests}人${d.total ? `\n費用：${d.total}` : ""}`,
};

const REASONS: Record<GuestLanguage, Record<DeclineReason, string>> = {
  ko: {
    FULLY_BOOKED: "해당 일정에 객실이 모두 찼습니다.",
    DATES_UNAVAILABLE: "해당 일정에는 예약을 받지 않습니다.",
    GROUP_SIZE: "요청하신 인원으로는 이용이 어렵습니다.",
    OTHER: "숙소 사정으로 예약을 진행하기 어렵습니다.",
  },
  ja: {
    FULLY_BOOKED: "ご希望の日程は満室となっております。",
    DATES_UNAVAILABLE: "ご希望の日程はご予約を承っておりません。",
    GROUP_SIZE: "ご希望の人数ではご利用いただけません。",
    OTHER: "施設の都合によりご予約をお受けできません。",
  },
  en: {
    FULLY_BOOKED: "We're fully booked on those dates.",
    DATES_UNAVAILABLE: "We aren't accepting bookings for those dates.",
    GROUP_SIZE: "We can't accommodate that number of guests.",
    OTHER: "We're unable to accept this booking.",
  },
  "zh-CN": {
    FULLY_BOOKED: "该日期客房已满。",
    DATES_UNAVAILABLE: "该日期暂不接受预订。",
    GROUP_SIZE: "无法接待该人数。",
    OTHER: "由于住宿方面的原因，无法接受此预订。",
  },
  "zh-TW": {
    FULLY_BOOKED: "該日期客房已滿。",
    DATES_UNAVAILABLE: "該日期暫不接受預訂。",
    GROUP_SIZE: "無法接待該人數。",
    OTHER: "由於住宿方面的原因，無法接受此預訂。",
  },
};

/** Fixed guest messages for booking outcomes (sent without the LLM). */
export const BOOKING_STRINGS: Record<GuestLanguage, Strings> = {
  ko: {
    approved: (d) => `예약이 확정되었습니다. 이용해 주셔서 감사합니다!\n\n${summary.ko(d)}`,
    declined: (d, r) =>
      `죄송합니다. 예약 요청을 확정하지 못했습니다. ${REASONS.ko[r]}\n\n${summary.ko(d)}`,
    expired: (d) =>
      `예약 요청이 처리 기한 내에 확정되지 않아 만료되었습니다. 다시 문의해 주시면 안내해 드리겠습니다.\n\n${summary.ko(d)}`,
    staffNote: "담당자 메모",
  },
  ja: {
    approved: (d) => `ご予約が確定いたしました。ご利用ありがとうございます！\n\n${summary.ja(d)}`,
    declined: (d, r) =>
      `申し訳ございません。ご予約リクエストを確定できませんでした。${REASONS.ja[r]}\n\n${summary.ja(d)}`,
    expired: (d) =>
      `ご予約リクエストは期限内に確定されなかったため、失効いたしました。改めてお問い合わせいただければご案内いたします。\n\n${summary.ja(d)}`,
    staffNote: "担当者より",
  },
  en: {
    approved: (d) => `Your booking is confirmed. Thank you for choosing us!\n\n${summary.en(d)}`,
    declined: (d, r) =>
      `We're sorry, we couldn't confirm your booking request. ${REASONS.en[r]}\n\n${summary.en(d)}`,
    expired: (d) =>
      `Your booking request expired before it could be confirmed. Feel free to ask again and we'll help you.\n\n${summary.en(d)}`,
    staffNote: "Note from staff",
  },
  "zh-CN": {
    approved: (d) => `您的预订已确认，感谢您的选择！\n\n${summary["zh-CN"](d)}`,
    declined: (d, r) =>
      `很抱歉，未能确认您的预订请求。${REASONS["zh-CN"][r]}\n\n${summary["zh-CN"](d)}`,
    expired: (d) => `您的预订请求因未在期限内确认而失效。欢迎再次咨询。\n\n${summary["zh-CN"](d)}`,
    staffNote: "工作人员留言",
  },
  "zh-TW": {
    approved: (d) => `您的預訂已確認，感謝您的選擇！\n\n${summary["zh-TW"](d)}`,
    declined: (d, r) =>
      `很抱歉，未能確認您的預訂請求。${REASONS["zh-TW"][r]}\n\n${summary["zh-TW"](d)}`,
    expired: (d) => `您的預訂請求因未在期限內確認而失效。歡迎再次諮詢。\n\n${summary["zh-TW"](d)}`,
    staffNote: "工作人員留言",
  },
};

/** Short human-friendly reference derived from the booking id. */
export function bookingReference(id: string): string {
  return id.slice(-6).toUpperCase();
}

/** Room type name in the guest's language (falls back to any available). */
export function localizedName(name: unknown, language: GuestLanguage): string {
  if (name && typeof name === "object") {
    const map = name as Record<string, string>;
    return map[language] ?? map.en ?? Object.values(map)[0] ?? "";
  }
  return typeof name === "string" ? name : "";
}
