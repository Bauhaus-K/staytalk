/** Guest-facing widget UI strings (client-safe). */
export const WIDGET_LANGUAGES = ["ko", "ja", "en", "zh-CN", "zh-TW"] as const;
export type WidgetLanguage = (typeof WIDGET_LANGUAGES)[number];

export type WidgetStrings = {
  subtitle: string;
  greeting: string;
  placeholder: string;
  send: string;
  close: string;
  typing: string;
  error: string;
  rateLimited: string;
  staff: string;
  privacyNote: string;
  connecting: string;
};

export const WIDGET_STRINGS: Record<WidgetLanguage, WidgetStrings> = {
  ko: {
    subtitle: "AI 컨시어지 · 필요하면 담당자가 직접 답변드려요",
    greeting: "안녕하세요! 숙박에 대해 궁금한 점을 편하게 물어보세요.",
    placeholder: "메시지를 입력하세요",
    send: "보내기",
    close: "닫기",
    typing: "답변을 준비하고 있어요…",
    error: "메시지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
    rateLimited: "메시지를 너무 빨리 보내고 있어요. 잠시 후 다시 시도해 주세요.",
    staff: "스태프",
    privacyNote: "카드번호·여권번호는 보내지 마세요.",
    connecting: "연결 중…",
  },
  ja: {
    subtitle: "AIコンシェルジュ・必要に応じて担当者が直接ご返信します",
    greeting: "こんにちは！ご滞在について、お気軽にご質問ください。",
    placeholder: "メッセージを入力",
    send: "送信",
    close: "閉じる",
    typing: "回答を準備しています…",
    error: "メッセージを送信できませんでした。しばらくしてからもう一度お試しください。",
    rateLimited: "送信が多すぎます。しばらくしてからもう一度お試しください。",
    staff: "スタッフ",
    privacyNote: "カード番号やパスポート番号は送信しないでください。",
    connecting: "接続中…",
  },
  en: {
    subtitle: "AI concierge · staff will step in when needed",
    greeting: "Hello! Feel free to ask anything about your stay.",
    placeholder: "Type a message",
    send: "Send",
    close: "Close",
    typing: "Preparing a reply…",
    error: "Couldn't send your message. Please try again shortly.",
    rateLimited: "You're sending messages too quickly. Please wait a moment.",
    staff: "Staff",
    privacyNote: "Please don't send card or passport numbers.",
    connecting: "Connecting…",
  },
  "zh-CN": {
    subtitle: "AI 礼宾 · 需要时由工作人员直接回复",
    greeting: "您好！关于住宿的任何问题都可以问我。",
    placeholder: "请输入消息",
    send: "发送",
    close: "关闭",
    typing: "正在准备回复…",
    error: "消息发送失败，请稍后再试。",
    rateLimited: "发送过于频繁，请稍后再试。",
    staff: "工作人员",
    privacyNote: "请勿发送银行卡号或护照号码。",
    connecting: "连接中…",
  },
  "zh-TW": {
    subtitle: "AI 禮賓 · 需要時由工作人員直接回覆",
    greeting: "您好！關於住宿的任何問題都可以問我。",
    placeholder: "請輸入訊息",
    send: "傳送",
    close: "關閉",
    typing: "正在準備回覆…",
    error: "訊息傳送失敗，請稍後再試。",
    rateLimited: "傳送過於頻繁，請稍後再試。",
    staff: "工作人員",
    privacyNote: "請勿傳送信用卡號或護照號碼。",
    connecting: "連線中…",
  },
};

/** Maps a browser language tag (navigator.language) to a supported widget language. */
export function resolveWidgetLanguage(
  tag: string | null | undefined,
  fallback: WidgetLanguage = "en",
): WidgetLanguage {
  const t = (tag ?? "").toLowerCase();
  if (t.startsWith("ko")) return "ko";
  if (t.startsWith("ja")) return "ja";
  if (t.startsWith("en")) return "en";
  if (t.startsWith("zh")) return /tw|hk|mo|hant/.test(t) ? "zh-TW" : "zh-CN";
  return fallback;
}
