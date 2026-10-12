"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { saveInventoryOverride, type OverrideState } from "@/server/actions/rooms";

type Props = { locale: string; roomTypes: { id: string; name: string }[]; defaultDate: string };

export function DayForm({ locale, roomTypes, defaultDate }: Props) {
  const t = useTranslations("rooms");
  const [state, action, pending] = useActionState<OverrideState, FormData>(
    saveInventoryOverride,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-3 border-t pt-4" data-testid="day-form">
      <p className="text-sm font-medium">{t("editDay")}</p>
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="grid gap-1">
          <Label htmlFor="day-room">{t("roomType")}</Label>
          <NativeSelect id="day-room" name="roomTypeId">
            {roomTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="day-date">{t("date")}</Label>
          <Input id="day-date" name="date" type="date" defaultValue={defaultDate} required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="day-available">{t("available")}</Label>
          <Input
            id="day-available"
            name="availableCount"
            inputMode="numeric"
            placeholder={t("defaultHint")}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="day-rate">{t("rate")}</Label>
          <Input id="day-rate" name="rate" inputMode="numeric" placeholder={t("defaultHint")} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="closed" /> {t("closeDay")}
      </label>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {t("invalid")}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" name="intent" value="apply" disabled={pending}>
          {t("apply")}
        </Button>
        <Button type="submit" name="intent" value="clear" variant="outline" disabled={pending}>
          {t("clear")}
        </Button>
      </div>
    </form>
  );
}
