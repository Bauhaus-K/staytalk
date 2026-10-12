import { getTranslations, setRequestLocale } from "next-intl/server";
import { asLocale } from "@/i18n/locale";
import { requireTenant } from "@/server/auth/session";
import { resolveActiveProperty } from "@/server/services/property";
import { RoomTypeForm } from "../room-type-form";

export default async function NewRoomTypePage({
  params,
  searchParams,
}: PageProps<"/[locale]/rooms/new">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const { db } = await requireTenant(locale);
  const t = await getTranslations("rooms");
  const { active } = await resolveActiveProperty(
    db,
    typeof sp.property === "string" ? sp.property : null,
  );
  if (!active) return null;
  const property = await db.property.findUniqueOrThrow({
    where: { id: active.id },
    select: { currency: true },
  });
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("newRoomType")}</h1>
      <RoomTypeForm locale={locale} propertyId={active.id} currency={property.currency} />
    </div>
  );
}
