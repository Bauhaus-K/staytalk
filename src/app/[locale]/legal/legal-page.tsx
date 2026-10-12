import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Link } from "@/i18n/navigation";

type Kind = "terms" | "privacy";

const SECTIONS = {
  terms: ["service", "account", "ai", "fees", "liability", "law"],
  privacy: ["collected", "purpose", "retention", "thirdParties", "rights", "contact"],
} as const;

/**
 * Placeholder legal page. TODO(legal): replace every section with reviewed
 * text (KR PIPA / JP APPI requirements for the privacy policy).
 */
export async function LegalPage({ kind }: { kind: Kind }) {
  const t = await getTranslations("legal");
  const sectionKey = kind === "terms" ? "termsSections" : "privacySections";
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <Link href="/" className="text-sm underline">
        {t("home")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{t(kind)}</h1>
        <p className="text-sm text-muted-foreground">{t("updated")}</p>
      </div>
      <p
        role="note"
        className="rounded-md border border-dashed p-3 text-sm"
        data-testid="legal-draft"
      >
        {t("draft")}
      </p>
      {SECTIONS[kind].map((s) => (
        <section key={s} className="flex flex-col gap-1">
          <h2 className="font-semibold">{t(`${sectionKey}.${s}` as "terms")}</h2>
          <p className="text-sm text-muted-foreground">
            {kind === "privacy" && s === "retention" ? t("retentionNote") : t("todo")}
          </p>
        </section>
      ))}
      <LocaleSwitcher className="justify-start" />
    </main>
  );
}
