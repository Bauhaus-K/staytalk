"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyInventoryCsv, previewInventoryCsv, type CsvState } from "@/server/actions/rooms";

export function CsvUpload({ locale, propertyId }: { locale: string; propertyId: string }) {
  const t = useTranslations("rooms");
  const [preview, previewAction, previewing] = useActionState<CsvState, FormData>(
    previewInventoryCsv,
    undefined,
  );
  const [result, applyAction, applying] = useActionState<CsvState, FormData>(
    applyInventoryCsv,
    undefined,
  );
  const errors = result?.errors?.length ? result.errors : (preview?.errors ?? []);

  return (
    <div className="flex flex-col gap-4">
      <form action={previewAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="propertyId" value={propertyId} />
        <div className="grid gap-1">
          <Label htmlFor="csv-file">{t("csvFile")}</Label>
          <Input id="csv-file" name="file" type="file" accept=".csv,text/csv" required />
        </div>
        <Button type="submit" variant="outline" disabled={previewing}>
          {t("preview")}
        </Button>
      </form>

      {preview?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {t("invalid")}
        </p>
      ) : null}

      {preview?.csv !== undefined && !result?.applied ? (
        <div className="flex flex-col gap-2" data-testid="csv-preview">
          {errors.length ? (
            <>
              <p role="alert" className="text-sm text-destructive">
                {t("csvErrors", { count: errors.length })}
              </p>
              <ul className="ml-4 list-disc text-sm" data-testid="csv-errors">
                {errors.map((e, i) => (
                  <li key={i}>
                    {t("line", { line: e.line })}: {t(`csvErrorCodes.${e.code}`)}
                    {e.value ? ` (${e.value})` : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <form action={applyAction} className="flex items-center gap-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="csv" value={preview.csv} />
              <span className="text-sm">{t("csvOk", { count: preview.rowCount ?? 0 })}</span>
              <Button type="submit" disabled={applying}>
                {t("applyCsv", { count: preview.rowCount ?? 0 })}
              </Button>
            </form>
          )}
        </div>
      ) : null}

      {result?.applied ? (
        <p role="status" className="text-sm">
          {t("csvApplied", result.applied)}
        </p>
      ) : null}
    </div>
  );
}
