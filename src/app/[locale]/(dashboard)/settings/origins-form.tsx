"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateAllowedOrigins, type OriginsState } from "@/server/actions/settings";

type Props = { locale: string; propertyId: string; origins: string[]; canEdit: boolean };

export function OriginsForm({ locale, propertyId, origins, canEdit }: Props) {
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState<OriginsState, FormData>(
    updateAllowedOrigins,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <Label htmlFor="origins">{t("allowedOrigins")}</Label>
      <Textarea
        id="origins"
        name="origins"
        rows={4}
        defaultValue={origins.join("\n")}
        disabled={!canEdit}
      />
      <p className="text-xs text-muted-foreground">{t("allowedOriginsHint")}</p>
      {state?.invalid ? (
        <p role="alert" className="text-sm text-destructive">
          {t("invalidOrigin", { value: state.invalid })}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="text-sm">
          {t("saved")}
        </p>
      ) : null}
      {canEdit ? (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
