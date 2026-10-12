import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { Prisma } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/locale";
import { cn } from "@/lib/utils";
import { requireTenant } from "@/server/auth/session";

const STATUSES = ["ESCALATED", "AI_HANDLING", "RESOLVED"] as const;

export default async function InboxPage({ params, searchParams }: PageProps<"/[locale]/inbox">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const { db } = await requireTenant(locale);
  const t = await getTranslations("inbox");
  const te = await getTranslations("enums");
  const format = await getFormatter();

  const status = STATUSES.find((s) => s === sp.status);
  const includeTest = sp.test === "1";
  const where: Prisma.ConversationWhereInput = {
    ...(status ? { status } : {}),
    ...(includeTest ? {} : { isTest: false }),
  };

  const [conversations, counts] = await Promise.all([
    db.conversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      include: {
        property: { select: { name: true, timezone: true } },
        // Preview what the guest said last: that's what staff triage on.
        messages: { where: { role: "GUEST" }, orderBy: { createdAt: "desc" }, take: 1 },
        escalations: { where: { status: "OPEN" }, select: { id: true, reason: true } },
      },
    }),
    db.conversation.groupBy({
      by: ["status"],
      where: includeTest ? {} : { isTest: false },
      _count: { _all: true },
    }),
  ]);
  const countFor = (s?: (typeof STATUSES)[number]) =>
    counts.filter((c) => !s || c.status === s).reduce((n, c) => n + c._count._all, 0);

  const href = (s?: string, test = includeTest) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (test) p.set("test", "1");
    const q = p.toString();
    return `/inbox${q ? `?${q}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh intervalMs={15_000} />
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[undefined, ...STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={href(s)}
            data-testid={`inbox-filter-${s ?? "all"}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm hover:bg-accent",
              s === status && "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {s ? te(`conversationStatus.${s}`) : t("all")} ({countFor(s)})
          </Link>
        ))}
        <Link href={href(status, !includeTest)} className="ml-auto text-xs underline">
          {t("showTest")} {includeTest ? "✓" : ""}
        </Link>
      </div>

      {conversations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2">
          {conversations.map((c) => {
            const last = c.messages[0];
            const preview = last ? (last.translatedContent ?? last.content) : t("noMessages");
            return (
              <li key={c.id}>
                <Link href={`/inbox/${c.id}`} data-testid="inbox-row" className="block">
                  <Card className="gap-1 py-3 transition-colors hover:bg-accent/50">
                    <CardContent className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant={c.status === "ESCALATED" ? "destructive" : "secondary"}>
                          {te(`conversationStatus.${c.status}`)}
                        </Badge>
                        {c.escalations.map((e) => (
                          <Badge key={e.id} variant="outline">
                            {te(`escalationReason.${e.reason}`)}
                          </Badge>
                        ))}
                        <span className="text-muted-foreground">
                          {c.property.name} · {t(`channel.${c.channel}`)} · {c.guestLanguage ?? "-"}
                        </span>
                        <span className="ml-auto text-muted-foreground">
                          {format.dateTime(c.lastMessageAt, {
                            dateStyle: "short",
                            timeStyle: "short",
                            timeZone: c.property.timezone,
                          })}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-sm">{preview}</p>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
