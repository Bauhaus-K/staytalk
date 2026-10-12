import { setRequestLocale } from "next-intl/server";
import { asLocale } from "@/i18n/locale";
import { LegalPage } from "../legal-page";

export default async function Page({ params }: PageProps<"/[locale]/legal/terms">) {
  setRequestLocale(asLocale((await params).locale));
  return <LegalPage kind="terms" />;
}
