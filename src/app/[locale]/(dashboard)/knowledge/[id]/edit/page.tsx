import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { asLocale } from "@/i18n/locale";
import { requireTenant } from "@/server/auth/session";
import { KnowledgeForm } from "../../knowledge-form";

export default async function EditKnowledgePage({
  params,
}: PageProps<"/[locale]/knowledge/[id]/edit">) {
  const { locale: rawLocale, id } = await params;
  const locale = asLocale(rawLocale);
  setRequestLocale(locale);
  const { db } = await requireTenant(locale);
  const t = await getTranslations("knowledge");

  const item = await db.knowledgeItem.findUnique({
    where: { id },
    include: { property: { select: { name: true, defaultLanguage: true } } },
  });
  if (!item) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("editItem")}</h1>
        <p className="text-sm text-muted-foreground">{item.property.name}</p>
      </div>
      <KnowledgeForm
        locale={locale}
        propertyId={item.propertyId}
        defaultLanguage={item.property.defaultLanguage}
        item={item}
      />
    </div>
  );
}
