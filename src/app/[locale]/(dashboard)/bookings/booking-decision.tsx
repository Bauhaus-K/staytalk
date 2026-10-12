"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { decideBooking, type BookingActionState } from "@/server/actions/bookings";

const REASONS = ["FULLY_BOOKED", "DATES_UNAVAILABLE", "GROUP_SIZE", "OTHER"] as const;

export function BookingDecision({ locale, bookingId }: { locale: string; bookingId: string }) {
  const t = useTranslations("bookings");
  const [declining, setDeclining] = useState(false);
  const [state, action, pending] = useActionState<BookingActionState, FormData>(
    decideBooking,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-2 border-t pt-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="bookingId" value={bookingId} />
      {declining ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor={`reason-${bookingId}`}>{t("declineReason")}</Label>
            <NativeSelect id={`reason-${bookingId}`} name="reason" defaultValue="FULLY_BOOKED">
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`reasons.${r}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`note-${bookingId}`}>{t("declineNote")}</Label>
            <Textarea id={`note-${bookingId}`} name="note" rows={2} maxLength={1000} />
          </div>
        </div>
      ) : null}
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
      <div className="flex gap-2">
        {declining ? (
          <>
            <Button
              type="submit"
              name="intent"
              value="decline"
              variant="destructive"
              disabled={pending}
            >
              {t("confirmDecline")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setDeclining(false)}>
              {t("cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" name="intent" value="approve" disabled={pending}>
              {t("approve")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setDeclining(true)}>
              {t("decline")}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
