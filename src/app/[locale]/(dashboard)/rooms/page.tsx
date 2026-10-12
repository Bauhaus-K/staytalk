import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertySwitcher } from "@/components/layout/property-switcher";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/locale";
import { cn } from "@/lib/utils";
import { addDays, parseIsoDate, todayIn, toIsoDate } from "@/lib/dates";
import { requireTenant } from "@/server/auth/session";
import { isGuestLanguage } from "@/server/language/codes";
import { localizedName } from "@/server/language/booking-strings";
import { quoteStay } from "@/server/services/availability";
import { resolveActiveProperty } from "@/server/services/property";
import { CsvUpload } from "./csv-upload";
import { DayForm } from "./day-form";

const DAYS = 14;

export default async function RoomsPage({ params, searchParams }: PageProps<"/[locale]/rooms">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const { db } = await requireTenant(locale);
  const t = await getTranslations("rooms");
  const tp = await getTranslations("property");

  const { properties, active } = await resolveActiveProperty(
    db,
    typeof sp.property === "string" ? sp.property : null,
  );
  if (!active) return <p className="text-sm text-muted-foreground">{tp("none")}</p>;
  const property = await db.property.findUniqueOrThrow({
    where: { id: active.id },
    select: { id: true, timezone: true, currency: true },
  });

  const today = todayIn(property.timezone);
  const requested = typeof sp.from === "string" ? parseIsoDate(sp.from) : null;
  const from = requested && requested >= today ? requested : today;
  const to = addDays(from, DAYS);

  const roomTypes = await db.roomType.findMany({
    where: { propertyId: property.id },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const [quotes, overrides] = await Promise.all([
    quoteStay(db, property.id, { checkIn: from, checkOut: to, nights: DAYS, guests: 1 }),
    db.availability.findMany({
      where: { roomTypeId: { in: roomTypes.map((r) => r.id) }, date: { gte: from, lt: to } },
      select: { roomTypeId: true, date: true, closed: true },
    }),
  ]);
  const overrideKeys = new Map(overrides.map((o) => [`${o.roomTypeId}:${toIsoDate(o.date)}`, o]));
  const dates = Array.from({ length: DAYS }, (_, i) => toIsoDate(addDays(from, i)));
  const lang = isGuestLanguage(locale) ? locale : "en";
  const name = (n: unknown) => localizedName(n, lang);
  const base = `/rooms?property=${property.id}`;
  const money = new Intl.NumberFormat(locale);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <PropertySwitcher properties={properties} activeId={property.id} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("roomTypes")}</CardTitle>
          <Button asChild size="sm">
            <Link href={`/rooms/new?property=${property.id}`}>
              <Plus /> {t("newRoomType")}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {roomTypes.map((rt) => (
              <li
                key={rt.id}
                className="flex flex-wrap items-center gap-3 py-2 text-sm"
                data-testid="room-type"
              >
                <span className="font-medium">{name(rt.name)}</span>
                {!rt.active ? <Badge variant="destructive">{t("inactive")}</Badge> : null}
                <span className="text-muted-foreground">
                  {t("capacity")} {rt.capacity} · {t(rt.pricingModel)} {money.format(rt.baseRate)}{" "}
                  {property.currency} · {t("rooms", { count: rt.totalRooms })}
                </span>
                <Button asChild variant="outline" size="sm" className="ml-auto">
                  <Link href={`/rooms/${rt.id}/edit`}>{t("edit")}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("calendar")}</CardTitle>
          <div className="flex gap-2">
            {from > today ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`${base}&from=${toIsoDate(addDays(from, -DAYS))}`}>← {t("prev")}</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}&from=${toIsoDate(to)}`}>{t("next")} →</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" data-testid="inventory-calendar">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-card p-2 text-left" />
                  {dates.map((d) => (
                    <th
                      key={d}
                      className="p-2 text-center font-normal whitespace-nowrap text-muted-foreground"
                    >
                      {d.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.roomTypeId} className="border-t">
                    <th className="sticky left-0 bg-card p-2 text-left font-medium whitespace-nowrap">
                      {name(q.name)}
                    </th>
                    {q.nights.map((n) => {
                      const o = overrideKeys.get(`${q.roomTypeId}:${n.date}`);
                      return (
                        <td
                          key={n.date}
                          data-date={n.date}
                          className={cn(
                            "p-2 text-center whitespace-nowrap",
                            o && "bg-accent",
                            (o?.closed || n.available === 0) && "text-destructive",
                          )}
                          title={o ? t("override") : undefined}
                        >
                          <div className="font-medium">{o?.closed ? "✕" : n.available}</div>
                          <div className="text-muted-foreground">{money.format(n.rate)}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DayForm
            locale={locale}
            roomTypes={roomTypes.map((rt) => ({ id: rt.id, name: name(rt.name) }))}
            defaultDate={toIsoDate(from)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("csv")}</CardTitle>
          <CardDescription>{t("csvHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CsvUpload locale={locale} propertyId={property.id} />
        </CardContent>
      </Card>
    </div>
  );
}
