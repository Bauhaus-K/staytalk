import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageList } from "@/components/conversation/message-list";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/locale";
import { isGuestLanguage } from "@/server/language/codes";
import { requireTenant } from "@/server/auth/session";
import { conversationStatusAction } from "@/server/actions/inbox";
import { getConversationView } from "@/server/services/conversation-view";
import { ReplyForm } from "./reply-form";

export default async function ConversationPage({
  params,
  searchParams,
}: PageProps<"/[locale]/inbox/[id]">) {
  const { locale: rawLocale, id } = await params;
  const locale = asLocale(rawLocale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const { db } = await requireTenant(locale);
  const t = await getTranslations("inbox");
  const te = await getTranslations("enums");

  const view = await getConversationView(db, id);
  if (!view) notFound();
  const property = await db.property.findUnique({
    where: { id: view.propertyId },
    select: { name: true, staffLanguage: true },
  });
  const showTranslation = sp.tr !== "0";
  const staffLanguage = property?.staffLanguage ?? "ko";

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh intervalMs={10_000} />
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/inbox" className="text-sm underline">
          ← {t("back")}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{property?.name}</h1>
        <Badge
          variant={view.status === "ESCALATED" ? "destructive" : "secondary"}
          data-testid="conversation-status"
        >
          {te(`conversationStatus.${view.status}`)}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {t(`channel.${view.channel}`)} · {t("guestLanguage")}: {view.guestLanguage ?? "-"}
        </span>
        <div className="ml-auto flex gap-2">
          {view.status !== "RESOLVED" ? (
            <form action={conversationStatusAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="conversationId" value={view.id} />
              <input type="hidden" name="action" value="resolve" />
              <Button type="submit" variant="outline" size="sm">
                {t("resolve")}
              </Button>
            </form>
          ) : null}
          {view.status !== "AI_HANDLING" ? (
            <form action={conversationStatusAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="conversationId" value={view.id} />
              <input type="hidden" name="action" value="returnToAi" />
              <Button type="submit" variant="outline" size="sm">
                {t("returnToAi")}
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {view.escalations.length ? (
        <Card className="gap-3 py-4">
          <CardHeader>
            <CardTitle className="text-base">{t("escalations")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {view.escalations.map((e) => (
              <div key={e.id} className="flex flex-col gap-1 text-sm" data-testid="escalation">
                <div className="flex items-center gap-2">
                  <Badge variant={e.reason === "EMERGENCY" ? "destructive" : "outline"}>
                    {te(`escalationReason.${e.reason}`)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {e.status === "OPEN" ? t("escalationOpen") : t("escalationResolved")}
                  </span>
                </div>
                <p>
                  <span className="text-muted-foreground">{t("summary")}:</span> {e.summary}
                </p>
                {e.question ? (
                  <p>
                    <span className="text-muted-foreground">{t("question")}:</span> {e.question}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="gap-4 py-4">
        <CardContent className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Link
              href={`/inbox/${view.id}${showTranslation ? "?tr=0" : ""}`}
              className="text-xs underline"
            >
              {showTranslation ? t("hideTranslation") : t("showTranslation")}
            </Link>
          </div>
          <MessageList view={view} showTranslation={showTranslation} />
          {view.status === "ESCALATED" ? (
            <p className="text-xs text-muted-foreground">{t("aiPaused")}</p>
          ) : null}
          <ReplyForm
            locale={locale}
            conversationId={view.id}
            staffLanguage={isGuestLanguage(staffLanguage) ? staffLanguage : "ko"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
