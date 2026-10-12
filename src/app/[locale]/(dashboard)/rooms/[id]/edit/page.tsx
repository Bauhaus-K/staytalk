import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { asLocale } from "@/i18n/locale";
import { requireTenant } from "@/server/auth/session";
import { RoomTypeForm } from "../../room-type-form";

export default async function EditRoomTypePage({ params }: PageProps<"/[locale]/rooms/[id]/edit">) {
  const { locale: raw, id } = await params;
  const locale = asLocale(raw);
  setRequestLocale(locale);
  const { db } = await requireTenant(locale);
  const t = await getTranslations("rooms");
  const roomType = await db.roomType.findUnique({
    where: { id },
    include: { property: { select: { currency: true } } },
  });
  if (!roomType) notFound();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("editRoomType")}</h1>
      <RoomTypeForm
        locale={locale}
        propertyId={roomType.propertyId}
        currency={roomType.property.currency}
        roomType={{
          ...roomType,
          name: (roomType.name ?? {}) as Record<string, string>,
        }}
      />
    </div>
  );
}
