"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { sendPlaygroundMessage } from "@/server/actions/playground";

type Props = {
  locale: string;
  propertyId: string;
  conversationId: string | null;
  showTranslation: boolean;
};

export function PlaygroundComposer({ locale, propertyId, conversationId, showTranslation }: Props) {
  const t = useTranslations("playground");
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const message = text.trim();
    if (!message || pending) return;
    setError(false);
    startTransition(async () => {
      const result = await sendPlaygroundMessage({
        locale: locale as "ko" | "ja" | "en",
        propertyId,
        conversationId,
        text: message,
      });
      if (!result.ok) {
        setError(true);
        return;
      }
      setText("");
      const url = `/playground?property=${propertyId}&c=${result.conversationId}${showTranslation ? "&tr=1" : ""}`;
      if (result.conversationId === conversationId) router.refresh();
      else router.replace(url);
    });
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        rows={2}
        maxLength={2000}
        disabled={pending}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !text.trim()}>
          {pending ? t("sending") : t("send")}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {t("sendError")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
