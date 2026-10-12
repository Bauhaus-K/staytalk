import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertySwitcher } from "@/components/layout/property-switcher";
import { asLocale } from "@/i18n/locale";
import { requireTenant } from "@/server/auth/session";
import { env } from "@/server/env";
import { resolveActiveProperty } from "@/server/services/property";
import { OriginsForm } from "./origins-form";

export default async function SettingsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/settings">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const { user, db } = await requireTenant(locale);
  const t = await getTranslations("settings");
  const tp = await getTranslations("property");

  const { properties, active } = await resolveActiveProperty(
    db,
    typeof sp.property === "string" ? sp.property : null,
  );
  if (!active) return <p className="text-sm text-muted-foreground">{tp("none")}</p>;
  const property = await db.property.findUnique({
    where: { id: active.id },
    select: { widgetPublicKey: true, allowedOrigins: true },
  });
  if (!property) return null;

  const appUrl = env.APP_URL.replace(/\/$/, "");
  const snippet = `<script src="${appUrl}/widget/v1.js" data-key="${property.widgetPublicKey}" async></script>`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <PropertySwitcher properties={properties} activeId={active.id} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("widget")}</CardTitle>
          <CardDescription>{t("widgetDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <pre
            className="overflow-x-auto rounded-md bg-muted p-3 text-xs"
            data-testid="embed-snippet"
          >
            {snippet}
          </pre>
          <p className="text-sm">
            {t("publicKey")}: <code>{property.widgetPublicKey}</code> ·{" "}
            <a
              className="underline"
              href={`${appUrl}/widget/frame?key=${property.widgetPublicKey}&lang=${locale}`}
              target="_blank"
              rel="noreferrer"
            >
              {t("preview")}
            </a>
          </p>
          <OriginsForm
            locale={locale}
            propertyId={active.id}
            origins={property.allowedOrigins}
            canEdit={user.role === "OWNER"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
