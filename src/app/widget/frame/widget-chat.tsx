"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIDGET_STRINGS, type WidgetLanguage } from "@/lib/widget-strings";

type GuestMessage = {
  id: string;
  from: "guest" | "host";
  kind: "guest" | "ai" | "staff" | "system";
  text: string;
  createdAt: string;
};

const POLL_OPEN_MS = 4_000;
const POLL_CLOSED_MS = 20_000;

function storageKey(widgetKey: string) {
  return `staytalk:${widgetKey}`;
}

function readToken(widgetKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(widgetKey));
  } catch {
    return null;
  }
}

function writeToken(widgetKey: string, token: string) {
  try {
    window.localStorage.setItem(storageKey(widgetKey), token);
  } catch {
    // Storage unavailable (private mode / blocked): session lasts for this page view.
  }
}

const noopSubscribe = () => () => {};

/** True when rendered inside the loader's iframe (false during SSR). */
function useEmbedded() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.parent !== window,
    () => false,
  );
}

/** Posts to the embedding page (loader). Only open/close/unread signals, nothing sensitive. */
function notifyParent(message: { type: string; count?: number }) {
  if (window.parent !== window) window.parent.postMessage(message, "*");
}

export function WidgetChat({
  widgetKey,
  language,
}: {
  widgetKey: string;
  language: WidgetLanguage;
}) {
  const t = WIDGET_STRINGS[language];
  const [token, setToken] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const embedded = useEmbedded();
  // Embedded frames start closed until the loader opens them; standalone frames are always open.
  const [openSignal, setOpenSignal] = useState<boolean | null>(null);
  const open = openSignal ?? !embedded;
  const seenCount = useRef(0);
  const listRef = useRef<HTMLOListElement>(null);

  // Session start / resume.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/widget/v1/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: widgetKey, token: readToken(widgetKey) }),
      });
      if (!response.ok || cancelled) {
        if (!cancelled) setError(t.error);
        return;
      }
      const data = (await response.json()) as {
        token: string;
        property: { name: string };
        messages: GuestMessage[];
      };
      writeToken(widgetKey, data.token);
      setToken(data.token);
      setPropertyName(data.property.name);
      setMessages(data.messages);
      seenCount.current = data.messages.length;
    })().catch(() => !cancelled && setError(t.error));
    return () => {
      cancelled = true;
    };
  }, [widgetKey, t.error]);

  // Open/close signals from the loader.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const type = (event.data as { type?: string } | null)?.type;
      if (type === "staytalk:open") setOpenSignal(true);
      if (type === "staytalk:close") setOpenSignal(false);
    };
    window.addEventListener("message", onMessage);
    notifyParent({ type: "staytalk:ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const response = await fetch("/api/widget/v1/messages", {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = (await response.json()) as { messages: GuestMessage[] };
    setMessages((current) =>
      // Keep an optimistic message while its send is still in flight.
      sending && data.messages.length < current.length ? current : data.messages,
    );
  }, [token, sending]);

  // Poll for staff replies.
  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => void refresh(), open ? POLL_OPEN_MS : POLL_CLOSED_MS);
    return () => window.clearInterval(id);
  }, [token, open, refresh]);

  // Unread badge for the launcher; auto-scroll when open.
  useEffect(() => {
    if (open) {
      seenCount.current = messages.length;
      listRef.current?.lastElementChild?.scrollIntoView({ block: "end" });
    }
    const unread = messages.slice(seenCount.current).filter((m) => m.from === "host").length;
    notifyParent({ type: "staytalk:unread", count: open ? 0 : unread });
  }, [messages, open]);

  const send = async () => {
    const body = text.trim();
    if (!body || !token || sending) return;
    setSending(true);
    setError(null);
    setText("");
    const optimistic: GuestMessage = {
      id: `local-${Date.now()}`,
      from: "guest",
      kind: "guest",
      text: body,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const response = await fetch("/api/widget/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: body }),
      });
      if (!response.ok) {
        setMessages((current) => current.filter((m) => m.id !== optimistic.id));
        setText(body);
        setError(response.status === 429 ? t.rateLimited : t.error);
        return;
      }
      const data = (await response.json()) as { messages: GuestMessage[] };
      setMessages(data.messages);
    } catch {
      setMessages((current) => current.filter((m) => m.id !== optimistic.id));
      setText(body);
      setError(t.error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background text-foreground" lang={language}>
      <header className="flex items-start gap-2 border-b bg-primary px-4 py-3 text-primary-foreground">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold" data-testid="widget-title">
            {propertyName || t.connecting}
          </p>
          <p className="text-xs opacity-80">{t.subtitle}</p>
        </div>
        {embedded ? (
          <button
            type="button"
            onClick={() => notifyParent({ type: "staytalk:close" })}
            aria-label={t.close}
            className="rounded p-1 hover:bg-primary-foreground/10"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </header>

      <ol
        ref={listRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto p-4"
        aria-live="polite"
      >
        <li className="max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">
          {t.greeting}
        </li>
        {messages.map((m) => (
          <li
            key={m.id}
            data-testid="widget-message"
            data-from={m.from}
            className={cn(
              "flex max-w-[85%] flex-col gap-0.5",
              m.from === "guest" ? "items-end self-end" : "items-start self-start",
            )}
          >
            {m.kind === "staff" ? (
              <span className="text-xs text-muted-foreground">{t.staff}</span>
            ) : null}
            <span
              className={cn(
                "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                m.from === "guest"
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-muted",
              )}
            >
              {m.text}
            </span>
          </li>
        ))}
        {sending ? (
          <li className="self-start text-xs text-muted-foreground" data-testid="widget-typing">
            {t.typing}
          </li>
        ) : null}
      </ol>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {error ? (
          <p role="alert" className="mb-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            disabled={!token}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
          <button
            type="submit"
            disabled={!token || sending || !text.trim()}
            aria-label={t.send}
            className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {t.privacyNote} ·{" "}
          <a
            href={`/${language === "ko" || language === "ja" ? language : "en"}/legal/privacy`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {t.privacyPolicy}
          </a>
        </p>
      </form>
    </div>
  );
}
