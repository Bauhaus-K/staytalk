import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageList } from "@/components/conversation/message-list";
import { PropertySwitcher } from "@/components/layout/property-switcher";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/locale";
import { requireTenant } from "@/server/auth/session";
import { env } from "@/server/env";
import { getConversationView } from "@/server/services/conversation-view";
import { resolveActiveProperty } from "@/server/services/property";
import { PlaygroundComposer } from "./composer";

export default async function PlaygroundPage({
  params,
  searchParams,
}: PageProps<"/[locale]/playground">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const { db } = await requireTenant(locale);
  const t = await getTranslations("playground");
  const te = await getTranslations("enums");
  const tp = await getTranslations("property");

  const { properties, active } = await resolveActiveProperty(
    db,
    typeof sp.property === "string" ? sp.property : null,
  );
  if (!active) return <p className="text-sm text-muted-foreground">{tp("none")}</p>;

  const conversationId = typeof sp.c === "string" ? sp.c : null;
  const view = conversationId ? await getConversationView(db, conversationId) : null;
  // Only continue playground conversations of the selected property.
  const current = view && view.propertyId === active.id && view.isTest ? view : null;
  const showTranslation = sp.tr === "1";

  const base = `/playground?property=${active.id}`;
  const withConversation = current ? `${base}&c=${current.id}` : base;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          <PropertySwitcher properties={properties} activeId={active.id} />
          <Button asChild variant="outline">
            <Link href={base}>{t("reset")}</Link>
          </Button>
        </div>
      </div>

      {env.AI_MODE === "mock" ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {t("mockNotice")}
        </p>
      ) : null}

      <Card className="gap-4 py-4">
        <CardContent className="flex flex-col gap-4">
          {current ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("status")}</span>
              <Badge
                variant={current.status === "ESCALATED" ? "destructive" : "secondary"}
                data-testid="conversation-status"
              >
                {te(`conversationStatus.${current.status}`)}
              </Badge>
              {current.escalations.map((e) => (
                <Badge key={e.id} variant="outline" data-testid="escalation-reason">
                  {t("escalation")}: {te(`escalationReason.${e.reason}`)}
                </Badge>
              ))}
              <Link
                href={`${withConversation}${showTranslation ? "" : "&tr=1"}`}
                className="ml-auto text-xs underline"
              >
                {t("showTranslation")} {showTranslation ? "✓" : ""}
              </Link>
            </div>
          ) : null}

          {current && current.messages.length ? (
            <MessageList view={current} showTranslation={showTranslation} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          )}

          <PlaygroundComposer
            locale={locale}
            propertyId={active.id}
            conversationId={current?.id ?? null}
            showTranslation={showTranslation}
          />
        </CardContent>
      </Card>
    </div>
  );
}
