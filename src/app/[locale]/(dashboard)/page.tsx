import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenant } from "@/server/auth/session";
import { asLocale } from "@/i18n/locale";

export default async function DashboardHome({ params }: PageProps<"/[locale]">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const { user, db } = await requireTenant(locale);
  const t = await getTranslations("dashboard");

  const [organization, properties] = await Promise.all([
    db.organization.findFirst(),
    db.property.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { knowledgeItems: true, roomTypes: true } } },
    }),
  ]);

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
          {properties.map((p) => (
            <Card key={p.id} data-testid="property-card">
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>
                  {p.country} · {p.address}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-4 text-sm text-muted-foreground">
                <span>{t("knowledgeCount", { count: p._count.knowledgeItems })}</span>
                <span>{t("roomTypeCount", { count: p._count.roomTypes })}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
