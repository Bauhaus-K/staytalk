import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/locale";
import { cn } from "@/lib/utils";
import { requireTenant } from "@/server/auth/session";
import { env } from "@/server/env";
import { localizedName } from "@/server/language/booking-strings";
import { isGuestLanguage } from "@/server/language/codes";
import TEMPLATES from "@/server/services/onboarding-templates.json";
import { OriginsForm } from "../settings/origins-form";
import { KnowledgeStep, PropertyStep, RoomStep } from "./steps";

const STEPS = ["property", "rooms", "knowledge", "widget"] as const;

export default async function OnboardingPage({
  params,
  searchParams,
}: PageProps<"/[locale]/onboarding">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const { user, db } = await requireTenant(locale);
  const t = await getTranslations("onboarding");

  const propertyId = typeof sp.property === "string" ? sp.property : null;
  const property = propertyId ? await db.property.findUnique({ where: { id: propertyId } }) : null;
  // Without a (valid) property the wizard starts by creating one.
  const step = property ? Math.min(4, Math.max(1, Number(sp.step) || 1)) : 1;
  const href = (n: number) => `/onboarding?property=${property?.id}&step=${n}`;
  const lang = isGuestLanguage(locale) ? locale : "en";

  const [roomTypes, knowledge] = property
    ? await Promise.all([
        db.roomType.findMany({ where: { propertyId: property.id }, orderBy: { sortOrder: "asc" } }),
        db.knowledgeItem.findMany({
          where: { propertyId: property.id },
          select: { question: true },
        }),
      ])
    : [[], []];
  const tt = await getTranslations("onboarding.templates");
  const existingQuestions = new Set(knowledge.map((k) => k.question));
  const templates = Object.keys(TEMPLATES).map((id) => {
    const question = tt(`${id}.question` as "checkin_time.question");
    return {
      id,
      question,
      hint: tt(`${id}.hint` as "checkin_time.hint"),
      added: existingQuestions.has(question),
    };
  });

  const appUrl = env.APP_URL.replace(/\/$/, "");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <ol className="flex flex-wrap gap-2 text-sm" aria-label={t("title")}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={step === i + 1 ? "step" : undefined}
            className={cn(
              "rounded-full border px-3 py-1",
              step === i + 1 && "bg-primary text-primary-foreground",
              step > i + 1 && "text-muted-foreground line-through decoration-1",
            )}
          >
            {i + 1}. {t(`steps.${s}`)}
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{property ? property.name : t("newProperty")}</CardTitle>
          {step === 2 ? <CardDescription>{t("roomsHint")}</CardDescription> : null}
          {step === 3 ? <CardDescription>{t("knowledgeHint")}</CardDescription> : null}
          {step === 4 ? <CardDescription>{t("widgetHint")}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {step === 1 ? (
            <PropertyStep
              locale={locale}
              canEdit={user.role === "OWNER"}
              property={
                property
                  ? {
                      id: property.id,
                      name: property.name,
                      country: property.country,
                      address: property.address,
                      timezone: property.timezone,
                      defaultLanguage: property.defaultLanguage,
                      staffLanguage: property.staffLanguage,
                      currency: property.currency,
                      checkInTime: property.checkInTime,
                      checkOutTime: property.checkOutTime,
                      phone: property.phone,
                    }
                  : null
              }
            />
          ) : null}

          {step === 2 && property ? (
            <>
              {roomTypes.length ? (
                <ul className="divide-y text-sm" data-testid="onboarding-rooms">
                  {roomTypes.map((r) => (
                    <li key={r.id} className="py-2">
                      {localizedName(r.name, lang)} · {r.capacity} · {r.baseRate.toLocaleString()}{" "}
                      {property.currency}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noRooms")}</p>
              )}
              <RoomStep locale={locale} propertyId={property.id} currency={property.currency} />
            </>
          ) : null}

          {step === 3 && property ? (
            <KnowledgeStep locale={locale} propertyId={property.id} templates={templates} />
          ) : null}

          {step === 4 && property ? (
            <>
              <pre
                className="overflow-x-auto rounded-md bg-muted p-3 text-xs"
                data-testid="embed-snippet"
              >
                {`<script src="${appUrl}/widget/v1.js" data-key="${property.widgetPublicKey}" async></script>`}
              </pre>
              <OriginsForm
                locale={locale}
                propertyId={property.id}
                origins={property.allowedOrigins}
                canEdit={user.role === "OWNER"}
              />
              <p className="text-sm">{t("done")}</p>
            </>
          ) : null}

          {property ? (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {step > 1 ? (
                <Button asChild variant="outline">
                  <Link href={href(step - 1)}>{t("back")}</Link>
                </Button>
              ) : null}
              {step < 4 ? (
                <Button asChild variant={step === 1 ? "outline" : "default"}>
                  <Link href={href(step + 1)}>{step === 1 ? t("skip") : t("next")}</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href={`/playground?property=${property.id}`}>{t("openPlayground")}</Link>
                </Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
