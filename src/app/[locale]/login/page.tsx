import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { LoginForm } from "./login-form";
import { asLocale } from "@/i18n/locale";

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("login");
  const tc = await getTranslations("common");

  const callbackUrl = typeof sp.callbackUrl === "string" ? sp.callbackUrl : "";
  const hasError = typeof sp.error === "string";

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <p className="text-2xl font-bold">{tc("appName")}</p>
          <p className="text-sm text-muted-foreground">{tc("tagline")}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1>{t("title")}</h1>
            </CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm
              locale={locale}
              callbackUrl={callbackUrl}
              initialError={hasError ? "genericError" : undefined}
            />
          </CardContent>
        </Card>
        <LocaleSwitcher />
      </div>
    </main>
  );
}
