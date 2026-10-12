import { getTranslations, setRequestLocale } from "next-intl/server";
import { asLocale } from "@/i18n/locale";
import { requireTenant } from "@/server/auth/session";
import { resolveActiveProperty } from "@/server/services/property";
import { KnowledgeForm } from "../knowledge-form";

export default async function NewKnowledgePage({
  params,
  searchParams,
}: PageProps<"/[locale]/knowledge/new">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const { db } = await requireTenant(locale);
  const t = await getTranslations("knowledge");
  const { active } = await resolveActiveProperty(
    db,
    typeof sp.property === "string" ? sp.property : null,
  );
  if (!active) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("newItem")}</h1>
        <p className="text-sm text-muted-foreground">{active.name}</p>
      </div>
      <KnowledgeForm
        locale={locale}
        propertyId={active.id}
        defaultLanguage={active.defaultLanguage}
      />
    </div>
  );
}
