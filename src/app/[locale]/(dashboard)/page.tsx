import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Meter } from "@/components/charts/meter";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/locale";
import { requireTenant } from "@/server/auth/session";
import { countUnansweredQuestions } from "@/server/services/unanswered";
import { usageStatus } from "@/server/services/usage";

export default async function DashboardHome({ params }: PageProps<"/[locale]">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const { user, db } = await requireTenant(locale);
  const t = await getTranslations("dashboard");
  const tm = await getTranslations("metrics");

  const [organization, properties] = await Promise.all([
    db.organization.findFirst(),
    db.property.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { knowledgeItems: true, roomTypes: true } } },
    }),
  ]);
  const cards = await Promise.all(
    properties.map(async (p) => {
      const [waiting, pending, unanswered, usage] = await Promise.all([
        db.conversation.count({ where: { propertyId: p.id, status: "ESCALATED", isTest: false } }),
        db.bookingRequest.count({ where: { propertyId: p.id, status: "PENDING" } }),
        countUnansweredQuestions(db, p.id),
        usageStatus(db, p),
      ]);
      return { property: p, waiting, pending, unanswered, usage };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">
          {t("welcome", { name: user.name ?? user.email ?? "" })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("organization", { name: organization?.name ?? "" })}
        </p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("properties")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map(({ property: p, waiting, pending, unanswered, usage }) => (
            <Card key={p.id} data-testid="property-card">
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>
                  {p.country} · {p.address}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex flex-wrap gap-4 text-muted-foreground">
                  <span>{t("knowledgeCount", { count: p._count.knowledgeItems })}</span>
                  <span>{t("roomTypeCount", { count: p._count.roomTypes })}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <Link href="/inbox?status=ESCALATED" className="underline">
                    {t("waiting", { count: waiting })}
                  </Link>
                  <Link href="/bookings?status=PENDING" className="underline">
                    {t("pendingBookings", { count: pending })}
                  </Link>
                  <Link href={`/knowledge/unanswered?property=${p.id}`} className="underline">
                    {t("unanswered", { count: unanswered })}
                  </Link>
                </div>
                {usage.ratio != null ? (
                  <Meter
                    ratio={usage.ratio}
                    level={usage.level}
                    label={tm("usage")}
                    statusLabel={usage.level === "over" ? tm("usageOver") : tm("usageWarning")}
                  />
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
