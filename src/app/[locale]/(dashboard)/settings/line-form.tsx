"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateLineSettings, type LineSettingsState } from "@/server/actions/settings";

type Props = {
  locale: string;
  propertyId: string;
  connection: { externalId: string | null; active: boolean; webhookUrl: string } | null;
  canEdit: boolean;
};

export function LineForm({ locale, propertyId, connection, canEdit }: Props) {
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState<LineSettingsState, FormData>(
    updateLineSettings,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-3" data-testid="line-form">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="externalId">{t("channelId")}</Label>
          <Input
            id="externalId"
            name="externalId"
            defaultValue={connection?.externalId ?? ""}
            disabled={!canEdit}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="channelSecret">{t("channelSecret")}</Label>
          <Input
            id="channelSecret"
            name="channelSecret"
            type="password"
            autoComplete="off"
            disabled={!canEdit}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="accessToken">{t("accessToken")}</Label>
          <Input
            id="accessToken"
            name="accessToken"
            type="password"
            autoComplete="off"
            disabled={!canEdit}
          />
        </div>
      </div>
      {connection ? <p className="text-xs text-muted-foreground">{t("keepHint")}</p> : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={connection?.active ?? true}
          disabled={!canEdit}
        />
        {t("lineActive")}
      </label>
      {connection ? (
        <p className="text-sm">
          {t("webhookUrl")}:{" "}
          <code
            className="rounded bg-muted px-1 py-0.5 text-xs break-all"
            data-testid="line-webhook-url"
          >
            {connection.webhookUrl}
          </code>
        </p>
      ) : null}
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {t(state.error)}
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
      ) : (
        <p className="text-xs text-muted-foreground">{t("ownerOnly")}</p>
      )}
    </form>
  );
}
