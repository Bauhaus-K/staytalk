import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PropertySwitcher } from "@/components/layout/property-switcher";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/locale";
import { requireTenant } from "@/server/auth/session";
import { dismissUnansweredQuestion } from "@/server/actions/knowledge";
import { resolveActiveProperty } from "@/server/services/property";
import { listUnansweredQuestions } from "@/server/services/unanswered";

export default async function UnansweredPage({
  params,
  searchParams,
}: PageProps<"/[locale]/knowledge/unanswered">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const { db } = await requireTenant(locale);
  const t = await getTranslations("unanswered");
  const tp = await getTranslations("property");
  const format = await getFormatter();

  const { properties, active } = await resolveActiveProperty(
    db,
    typeof sp.property === "string" ? sp.property : null,
  );
  if (!active) return <p className="text-sm text-muted-foreground">{tp("none")}</p>;
  const questions = await listUnansweredQuestions(db, active.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <PropertySwitcher properties={properties} activeId={active.id} />
      </div>
      {questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2">
          {questions.map((q) => (
            <li key={q.id}>
              <Card className="py-3" data-testid="unanswered-question">
                <CardContent className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{q.translated ?? q.question}</p>
                    {q.translated ? (
                      <p className="text-xs text-muted-foreground">
                        {t("original")} ({q.guestLanguage}): {q.question}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(q.createdAt, { dateStyle: "short", timeStyle: "short" })} ·{" "}
                      <Link href={`/inbox/${q.conversationId}`} className="underline">
                        {t("conversation")}
                      </Link>
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link href={`/knowledge/new?property=${active.id}&fromEscalation=${q.id}`}>
                      {t("add")}
                    </Link>
                  </Button>
                  <form action={dismissUnansweredQuestion}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="escalationId" value={q.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      {t("dismiss")}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
