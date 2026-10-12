"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { loginWithMagicLink, loginWithPassword, type LoginState } from "@/server/auth/actions";

type Props = {
  locale: string;
  callbackUrl: string;
  initialError?: "genericError";
};

export function LoginForm({ locale, callbackUrl, initialError }: Props) {
  const t = useTranslations("login");
  const initial: LoginState = initialError ? { error: initialError } : undefined;
  const [pwState, pwAction, pwPending] = useActionState(loginWithPassword, initial);
  const [mlState, mlAction, mlPending] = useActionState(loginWithMagicLink, undefined);
  const error = pwState?.error ?? mlState?.error;

  if (mlState?.magicLinkSent) {
    return (
      <p role="status" className="text-sm">
        {t("magicLinkSent")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={pwAction} className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div className="grid gap-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">{t("password")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {error ? (
          <p role="alert" data-testid="login-error" className="text-sm text-destructive">
            {t(error)}
          </p>
        ) : null}
        <Button type="submit" disabled={pwPending}>
          {pwPending ? t("submitting") : t("submit")}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        {t("or")}
        <Separator className="flex-1" />
      </div>

      <form action={mlAction} className="flex flex-col gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <Label htmlFor="magic-email" className="sr-only">
          {t("email")}
        </Label>
        <Input
          id="magic-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t("email")}
          required
        />
        <Button type="submit" variant="outline" disabled={mlPending}>
          {t("magicLink")}
        </Button>
      </form>
    </div>
  );
}
