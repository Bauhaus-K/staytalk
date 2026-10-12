import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PropertySwitcher } from "@/components/layout/property-switcher";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/locale";
import { cn } from "@/lib/utils";
import { requireTenant } from "@/server/auth/session";
import { KNOWLEDGE_CATEGORIES } from "@/server/services/knowledge";
import { resolveActiveProperty } from "@/server/services/property";
import { DeleteKnowledgeButton } from "./delete-button";

export default async function KnowledgePage({
  params,
  searchParams,
}: PageProps<"/[locale]/knowledge">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const { db } = await requireTenant(locale);
  const t = await getTranslations("knowledge");
  const te = await getTranslations("enums");
  const tp = await getTranslations("property");

  const { properties, active } = await resolveActiveProperty(
    db,
    typeof sp.property === "string" ? sp.property : null,
  );
  if (!active) return <p className="text-sm text-muted-foreground">{tp("none")}</p>;

  const category = KNOWLEDGE_CATEGORIES.find((c) => c === sp.category);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const where: Prisma.KnowledgeItemWhereInput = {
    propertyId: active.id,
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { question: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const items = await db.knowledgeItem.findMany({
    where,
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });

  const qs = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ property: active.id });
    const merged = { category, q: q || undefined, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/knowledge?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          <PropertySwitcher properties={properties} activeId={active.id} />
          <Button asChild>
            <Link href={`/knowledge/new?property=${active.id}`}>
              <Plus /> {t("newItem")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[undefined, ...KNOWLEDGE_CATEGORIES].map((c) => (
          <Link
            key={c ?? "all"}
            href={qs({ category: c })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm hover:bg-accent",
              c === category && "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {c ? te(`category.${c}`) : t("allCategories")}
          </Link>
        ))}
        <form className="ml-auto flex gap-2" action="">
          <input type="hidden" name="property" value={active.id} />
          {category ? <input type="hidden" name="category" value={category} /> : null}
          <Input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="w-56" />
          <Button type="submit" variant="outline">
            {t("search")}
          </Button>
        </form>
      </div>

      <p className="text-sm text-muted-foreground">{t("count", { count: items.length })}</p>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <Card key={item.id} className="gap-2 py-4" data-testid="knowledge-item">
              <CardContent className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{te(`category.${item.category}`)}</Badge>
                  <Badge variant="outline">{item.language}</Badge>
                  {!item.active ? <Badge variant="destructive">{t("inactive")}</Badge> : null}
                  <span className="font-medium">{item.question}</span>
                  <div className="ml-auto flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/knowledge/${item.id}/edit`}>{t("edit")}</Link>
                    </Button>
                    <DeleteKnowledgeButton id={item.id} propertyId={active.id} locale={locale} />
                  </div>
                </div>
                <p className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">
                  {item.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
