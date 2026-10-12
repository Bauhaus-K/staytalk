import { getTranslations, setRequestLocale } from "next-intl/server";
import { asLocale } from "@/i18n/locale";

// Placeholder: implemented in a later phase.
export default async function Page({ params }: PageProps<"/[locale]/settings">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">{t("nav.settings")}</h1>
      <p className="text-sm text-muted-foreground">{t("dashboard.comingSoon")}</p>
    </div>
  );
}
