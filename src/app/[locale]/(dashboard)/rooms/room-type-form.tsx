"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { saveRoomType, type RoomTypeFormState } from "@/server/actions/rooms";

type Props = {
  locale: string;
  propertyId: string;
  currency: string;
  roomType?: {
    id: string;
    name: Record<string, string>;
    capacity: number;
    pricingModel: "PER_ROOM" | "PER_PERSON";
    baseRate: number;
    totalRooms: number;
    active: boolean;
  };
};

export function RoomTypeForm({ locale, propertyId, currency, roomType }: Props) {
  const t = useTranslations("rooms");
  const [state, action, pending] = useActionState<RoomTypeFormState, FormData>(
    saveRoomType,
    undefined,
  );
  const field = (id: string, label: string, input: React.ReactNode) => (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      {input}
    </div>
  );

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="propertyId" value={propertyId} />
      {roomType ? <input type="hidden" name="id" value={roomType.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {field(
          "nameKo",
          t("nameKo"),
          <Input id="nameKo" name="nameKo" defaultValue={roomType?.name.ko} />,
        )}
        {field(
          "nameJa",
          t("nameJa"),
          <Input id="nameJa" name="nameJa" defaultValue={roomType?.name.ja} />,
        )}
        {field(
          "nameEn",
          t("nameEn"),
          <Input id="nameEn" name="nameEn" defaultValue={roomType?.name.en} />,
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {field(
          "capacity",
          t("capacity"),
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            max={20}
            defaultValue={roomType?.capacity ?? 2}
            required
          />,
        )}
        {field(
          "pricingModel",
          t("pricingModel"),
          <NativeSelect
            id="pricingModel"
            name="pricingModel"
            defaultValue={roomType?.pricingModel ?? "PER_ROOM"}
          >
            <option value="PER_ROOM">{t("PER_ROOM")}</option>
            <option value="PER_PERSON">{t("PER_PERSON")}</option>
          </NativeSelect>,
        )}
        {field(
          "baseRate",
          t("baseRate", { currency }),
          <Input
            id="baseRate"
            name="baseRate"
            type="number"
            min={0}
            defaultValue={roomType?.baseRate}
            required
          />,
        )}
        {field(
          "totalRooms",
          t("totalRooms"),
          <Input
            id="totalRooms"
            name="totalRooms"
            type="number"
            min={0}
            defaultValue={roomType?.totalRooms ?? 1}
            required
          />,
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={roomType?.active ?? true} />{" "}
        {t("active")}
      </label>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {t(state.error)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        <Button asChild variant="outline">
          <Link href={`/rooms?property=${propertyId}`}>{t("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
