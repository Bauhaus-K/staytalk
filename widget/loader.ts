/**
 * StayTalk widget loader. Embedded on a property's website with:
 *
 *   <script src="https://APP/widget/v1.js" data-key="pk_..." async></script>
 *
 * Adds a launcher button and lazily opens the chat in an iframe served from
 * the StayTalk origin. Optional: data-lang="ja" to force the UI language.
 * Exposes window.StayTalk.open() / .close().
 */

type StayTalkApi = { open(): void; close(): void };

declare global {
  interface Window {
    StayTalk?: StayTalkApi;
  }
}

const LABELS: Record<string, { open: string; close: string }> = {
  ko: { open: "채팅 문의 열기", close: "채팅 닫기" },
  ja: { open: "チャットで問い合わせる", close: "チャットを閉じる" },
  en: { open: "Open chat", close: "Close chat" },
  zh: { open: "打开聊天", close: "关闭聊天" },
};

const CHAT_ICON =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const CLOSE_ICON =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

const Z = "2147483000";

function init() {
  if (window.StayTalk) return;
  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>("script[data-key][src*='/widget/v1.js']");
  const key = script?.dataset.key;
  if (!script || !key) return;

  const appOrigin = new URL(script.src, location.href).origin;
  const lang = script.dataset.lang || navigator.language || "en";
  const labels = LABELS[lang.slice(0, 2).toLowerCase()] ?? LABELS.en!;

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.setAttribute("aria-label", labels.open);
  launcher.setAttribute("aria-expanded", "false");
  launcher.dataset.staytalk = "launcher";
  launcher.innerHTML = CHAT_ICON;
  Object.assign(launcher.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    border: "none",
    background: "#171717",
    color: "#fff",
    boxShadow: "0 4px 16px rgba(0,0,0,.25)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: Z,
  });

  const badge = document.createElement("span");
  Object.assign(badge.style, {
    position: "absolute",
    top: "-2px",
    right: "-2px",
    minWidth: "20px",
    height: "20px",
    padding: "0 5px",
    borderRadius: "10px",
    background: "#e11d48",
    color: "#fff",
    font: "600 12px/20px system-ui, sans-serif",
    display: "none",
  });
  launcher.appendChild(badge);

  const panel = document.createElement("div");
  panel.dataset.staytalk = "panel";
  Object.assign(panel.style, {
    position: "fixed",
    zIndex: Z,
    display: "none",
    overflow: "hidden",
    background: "#fff",
    boxShadow: "0 8px 32px rgba(0,0,0,.25)",
  });

  const mobile = window.matchMedia("(max-width: 640px)");
  const layout = () => {
    if (mobile.matches) {
      Object.assign(panel.style, { inset: "0", width: "100%", height: "100%", borderRadius: "0" });
    } else {
      Object.assign(panel.style, {
        inset: "auto",
        right: "20px",
        bottom: "88px",
        width: "380px",
        height: "min(600px, calc(100vh - 108px))",
        borderRadius: "16px",
      });
    }
  };
  layout();
  mobile.addEventListener("change", layout);

  let frame: HTMLIFrameElement | null = null;
  let isOpen = false;

  const ensureFrame = () => {
    if (frame) return frame;
    frame = document.createElement("iframe");
    frame.title = "StayTalk chat";
    frame.src = `${appOrigin}/widget/frame?key=${encodeURIComponent(key)}&lang=${encodeURIComponent(lang)}`;
    frame.allow = "clipboard-write";
    Object.assign(frame.style, { width: "100%", height: "100%", border: "0", display: "block" });
    panel.appendChild(frame);
    return frame;
  };

  const post = (type: string) => frame?.contentWindow?.postMessage({ type }, appOrigin);

  const open = () => {
    ensureFrame();
    isOpen = true;
    panel.style.display = "block";
    launcher.setAttribute("aria-expanded", "true");
    launcher.setAttribute("aria-label", labels.close);
    launcher.innerHTML = CLOSE_ICON;
    launcher.appendChild(badge);
    badge.style.display = "none";
    // On mobile the panel covers the page; hide the launcher (the frame has its own close button).
    launcher.style.display = mobile.matches ? "none" : "flex";
    post("staytalk:open");
  };

  const close = () => {
    isOpen = false;
    panel.style.display = "none";
    launcher.style.display = "flex";
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-label", labels.open);
    launcher.innerHTML = CHAT_ICON;
    launcher.appendChild(badge);
    post("staytalk:close");
  };

  launcher.addEventListener("click", () => (isOpen ? close() : open()));

  window.addEventListener("message", (event) => {
    if (event.origin !== appOrigin || !frame || event.source !== frame.contentWindow) return;
    const data = event.data as { type?: string; count?: number } | null;
    if (data?.type === "staytalk:ready") post(isOpen ? "staytalk:open" : "staytalk:close");
    if (data?.type === "staytalk:close") close();
    if (data?.type === "staytalk:unread") {
      const count = Number(data.count) || 0;
      badge.textContent = count > 9 ? "9+" : String(count);
      badge.style.display = count > 0 && !isOpen ? "block" : "none";
    }
  });

  document.body.appendChild(panel);
  document.body.appendChild(launcher);
  window.StayTalk = { open, close };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export {};
