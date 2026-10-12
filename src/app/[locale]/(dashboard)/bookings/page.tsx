import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/locale";
import { cn } from "@/lib/utils";
import { nightsBetween, toIsoDate } from "@/lib/dates";
import { requireTenant } from "@/server/auth/session";
import { bookingReference, localizedName } from "@/server/language/booking-strings";
import { isGuestLanguage } from "@/server/language/codes";
import { BookingDecision } from "./booking-decision";

const STATUSES = ["PENDING", "APPROVED", "DECLINED", "EXPIRED"] as const;

export default async function BookingsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/bookings">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const { db } = await requireTenant(locale);
  const t = await getTranslations("bookings");
  const format = await getFormatter();
  const status = STATUSES.find((s) => s === sp.status) ?? "PENDING";

  const [bookings, counts] = await Promise.all([
    db.bookingRequest.findMany({
      where: { status },
      orderBy: status === "PENDING" ? { expiresAt: "asc" } : { createdAt: "desc" },
      take: 100,
      include: {
        roomType: { select: { name: true } },
        property: { select: { name: true, timezone: true } },
      },
    }),
    db.bookingRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countFor = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const lang = isGuestLanguage(locale) ? locale : "en";

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh intervalMs={20_000} />
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/bookings?status=${s}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm hover:bg-accent",
              s === status && "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {t(`status.${s}`)} ({countFor(s)})
          </Link>
        ))}
      </div>

      {bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {bookings.map((b) => {
            const dt = (d: Date) =>
              format.dateTime(d, {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: b.property.timezone,
              });
            return (
              <li key={b.id}>
                <Card className="gap-3 py-4" data-testid="booking-card">
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant={b.status === "PENDING" ? "default" : "secondary"}>
                        {t(`status.${b.status}`)}
                      </Badge>
                      <span className="font-medium">
                        {t("reference", { ref: bookingReference(b.id) })}
                      </span>
                      <span className="text-muted-foreground">{b.property.name}</span>
                      {b.conversationId ? (
                        <Link
                          href={`/inbox/${b.conversationId}`}
                          className="ml-auto text-xs underline"
                        >
                          {t("conversation")}
                        </Link>
                      ) : null}
                    </div>
                    <div className="grid gap-1 text-sm sm:grid-cols-2">
                      <p>
                        <span className="font-medium">{localizedName(b.roomType.name, lang)}</span>{" "}
                        · {toIsoDate(b.checkIn)} → {toIsoDate(b.checkOut)} ·{" "}
                        {t("nights", { count: nightsBetween(b.checkIn, b.checkOut) })} ·{" "}
                        {t("guests", { count: b.guests })}
                      </p>
                      <p>
                        {t("total")}:{" "}
                        {b.quotedTotal != null
                          ? format.number(b.quotedTotal, {
                              style: "currency",
                              currency: b.currency,
                              maximumFractionDigits: 0,
                            })
                          : "-"}
                      </p>
                      <p>
                        {t("guest")}: {b.guestName} · {t("contact")}: {b.guestContact} ·{" "}
                        {t("language")}: {b.guestLanguage}
                      </p>
                      <p className="text-muted-foreground">
                        {t("created")}: {dt(b.createdAt)}
                        {b.status === "PENDING" ? ` · ${t("expires")}: ${dt(b.expiresAt)}` : ""}
                        {b.decidedAt ? ` · ${t("decided")}: ${dt(b.decidedAt)}` : ""}
                      </p>
                      {b.note ? (
                        <p className="sm:col-span-2">
                          {t("note")}: {b.note}
                        </p>
                      ) : null}
                      {b.declineReason ? (
                        <p className="text-muted-foreground sm:col-span-2">
                          {t("declineReason")}: {t(`reasons.${b.declineReason as "OTHER"}`)}
                          {b.declineNote ? ` — ${b.declineNote}` : ""}
                        </p>
                      ) : null}
                    </div>
                    {b.status === "PENDING" ? (
                      <BookingDecision locale={locale} bookingId={b.id} />
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
