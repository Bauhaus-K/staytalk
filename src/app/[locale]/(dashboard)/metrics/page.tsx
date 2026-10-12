import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { Meter } from "@/components/charts/meter";
import { StatTile } from "@/components/charts/stat-tile";
import { PropertySwitcher } from "@/components/layout/property-switcher";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/locale";
import { cn } from "@/lib/utils";
import { addDays, todayIn } from "@/lib/dates";
import { requireTenant } from "@/server/auth/session";
import { isGuestLanguage } from "@/server/language/codes";
import {
  getPropertyMetrics,
  METRIC_RANGES,
  rangeStart,
  type MetricRange,
} from "@/server/services/metrics";
import { resolveActiveProperty } from "@/server/services/property";
import { usageStatus } from "@/server/services/usage";

export default async function MetricsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/metrics">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const { db } = await requireTenant(locale);
  const t = await getTranslations("metrics");
  const te = await getTranslations("enums");
  const tb = await getTranslations("bookings");
  const tp = await getTranslations("property");
  const format = await getFormatter();

  const { properties, active } = await resolveActiveProperty(
    db,
    typeof sp.property === "string" ? sp.property : null,
  );
  if (!active) return <p className="text-sm text-muted-foreground">{tp("none")}</p>;
  const property = await db.property.findUniqueOrThrow({
    where: { id: active.id },
    select: { id: true, timezone: true, monthlyTokenLimit: true },
  });

  const days: MetricRange = METRIC_RANGES.find((d) => String(d) === sp.days) ?? 30;
  const today = todayIn(property.timezone);
  const from = rangeStart(today, days);
  const m = await getPropertyMetrics(db, {
    propertyId: property.id,
    timezone: property.timezone,
    from,
    to: addDays(today, 1),
  });
  const usage = await usageStatus(db, property);

  const pct = (v: number | null) =>
    v == null ? t("none") : format.number(v, { style: "percent", maximumFractionDigits: 0 });
  const duration = (minutes: number | null) =>
    minutes == null
      ? t("none")
      : minutes < 120
        ? t("minutes", { value: Math.round(minutes) })
        : t("hours", { value: format.number(minutes / 60, { maximumFractionDigits: 1 }) });
  const usd = (micro: number) =>
    format.number(micro / 1_000_000, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  const languageLabel = (code: string) =>
    isGuestLanguage(code) ? te(`language.${code}`) : t("unknownLanguage");

  const base = `/metrics?property=${property.id}`;
  const decided = m.bookings.approved + m.bookings.declined + m.bookings.expired;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <PropertySwitcher properties={properties} activeId={property.id} />
      </div>

      {/* Filters: one row above the charts. */}
      <div className="flex gap-2">
        {METRIC_RANGES.map((d) => (
          <Link
            key={d}
            href={`${base}&days=${d}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm hover:bg-accent",
              d === days && "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {t("range", { days: d })}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          testId="kpi-conversations"
          label={t("conversations")}
          value={String(m.conversations.total)}
          sub={t("openNow", { ai: m.automation.aiHandling, escalated: m.automation.escalated })}
        />
        <StatTile
          testId="kpi-automation"
          label={t("automationRate")}
          value={pct(m.automation.rate)}
          sub={t("automationSub", {
            resolved: m.automation.resolved,
            ai: m.automation.resolvedByAi,
          })}
        />
        <StatTile
          testId="kpi-first-response"
          label={t("firstResponse")}
          value={duration(m.escalations.firstResponse.avgMinutes)}
          sub={t("firstResponseSub", {
            median: duration(m.escalations.firstResponse.medianMinutes),
            count: m.escalations.firstResponse.count,
          })}
        />
        <StatTile
          testId="kpi-approval"
          label={t("approvalRate")}
          value={pct(m.bookings.approvalRate)}
          sub={t("approvalSub", {
            decided,
            approved: m.bookings.approved,
            pending: m.bookings.pending,
          })}
        />
        <StatTile
          testId="kpi-cost"
          label={t("cost")}
          value={usd(m.cost.totalMicroUsd)}
          sub={t("costSub")}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("daily")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ColumnChart
            title={t("daily")}
            tableLabel={t("table")}
            valueLabel={t("count")}
            data={m.conversations.byDay.map((d) => ({
              key: d.date,
              label: d.date.slice(5),
              value: d.count,
            }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("languages")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              testId="language-share"
              emptyLabel={t("noData")}
              items={m.languages.map((l) => ({
                key: l.language,
                label: languageLabel(l.language),
                value: l.count,
                display: `${l.count} · ${pct(l.count / Math.max(1, m.conversations.total))}`,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reasons")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              testId="escalation-reasons"
              emptyLabel={t("noData")}
              items={m.escalations.byReason.map((r) => ({
                key: r.reason,
                label: te(`escalationReason.${r.reason}`),
                value: r.count,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("bookingStatus")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              testId="booking-outcomes"
              emptyLabel={t("noData")}
              items={(["APPROVED", "DECLINED", "EXPIRED", "PENDING"] as const)
                .map((s) => ({
                  key: s,
                  label: tb(`status.${s}`),
                  value: m.bookings[s.toLowerCase() as "approved"],
                }))
                .filter((i) => i.value > 0)}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("usage")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {usage.ratio == null ? (
            <p className="text-sm text-muted-foreground">{t("usageUnlimited")}</p>
          ) : (
            <Meter
              ratio={usage.ratio}
              level={usage.level}
              label={`${t("usageLabel")} (${format.number(usage.tokens)} / ${format.number(usage.limit!)})`}
              statusLabel={usage.level === "over" ? t("usageOver") : t("usageWarning")}
            />
          )}
          <p className="text-xs text-muted-foreground">{usd(usage.costMicroUsd)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
