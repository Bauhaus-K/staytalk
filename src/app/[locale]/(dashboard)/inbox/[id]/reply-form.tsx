"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { staffReplyAction, type InboxActionState } from "@/server/actions/inbox";

type Props = {
  locale: string;
  conversationId: string;
  staffLanguage: "ko" | "ja" | "en" | "zh-CN" | "zh-TW";
};

export function ReplyForm({ locale, conversationId, staffLanguage }: Props) {
  const t = useTranslations("inbox");
  const te = useTranslations("enums");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<InboxActionState, FormData>(
    staffReplyAction,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2 border-t pt-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <Label htmlFor="reply">{t("reply")}</Label>
      <Textarea id="reply" name="text" rows={3} maxLength={4000} required />
      <p className="text-xs text-muted-foreground">
        {t("replyHint", { language: te(`language.${staffLanguage}`) })}
      </p>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {t("errors.generic")}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("sending") : t("send")}
        </Button>
      </div>
    </form>
  );
}
