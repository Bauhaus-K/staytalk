"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  addRoomTypeStep,
  saveKnowledgeStep,
  savePropertyStep,
  type OnboardingState,
} from "@/server/actions/onboarding";

const LANGUAGES = ["ko", "ja", "en", "zh-CN", "zh-TW"] as const;

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Feedback({ state }: { state: OnboardingState }) {
  const t = useTranslations("onboarding");
  if (state?.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t(state.error)}
      </p>
    );
  }
  if (state?.saved !== undefined) {
    return (
      <p role="status" className="text-sm">
        {t("knowledgeSaved", { count: state.saved })}
      </p>
    );
  }
  return null;
}

type PropertyData = {
  id: string;
  name: string;
  country: "KR" | "JP";
  address: string;
  timezone: string;
  defaultLanguage: string;
  staffLanguage: string;
  currency: string;
  checkInTime: string;
  checkOutTime: string;
  phone: string | null;
};

export function PropertyStep({
  locale,
  property,
  canEdit,
}: {
  locale: string;
  property: PropertyData | null;
  canEdit: boolean;
}) {
  const t = useTranslations("onboarding");
  const te = useTranslations("enums");
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    savePropertyStep,
    undefined,
  );
  const p = property;
  const defaults =
    locale === "ja"
      ? { country: "JP", tz: "Asia/Tokyo", cur: "JPY" }
      : { country: "KR", tz: "Asia/Seoul", cur: "KRW" };

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="property-step">
      <input type="hidden" name="locale" value={locale} />
      {p ? <input type="hidden" name="propertyId" value={p.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="name" label={t("name")}>
          <Input id="name" name="name" defaultValue={p?.name} required disabled={!canEdit} />
        </Field>
        <Field id="country" label={t("country")}>
          <NativeSelect
            id="country"
            name="country"
            defaultValue={p?.country ?? defaults.country}
            disabled={!canEdit}
          >
            <option value="KR">{t("countries.KR")}</option>
            <option value="JP">{t("countries.JP")}</option>
          </NativeSelect>
        </Field>
        <Field id="address" label={t("address")}>
          <Input
            id="address"
            name="address"
            defaultValue={p?.address}
            required
            disabled={!canEdit}
          />
        </Field>
        <Field id="timezone" label={t("timezone")}>
          <NativeSelect
            id="timezone"
            name="timezone"
            defaultValue={p?.timezone ?? defaults.tz}
            disabled={!canEdit}
          >
            <option value="Asia/Seoul">Asia/Seoul</option>
            <option value="Asia/Tokyo">Asia/Tokyo</option>
          </NativeSelect>
        </Field>
        <Field id="defaultLanguage" label={t("defaultLanguage")}>
          <NativeSelect
            id="defaultLanguage"
            name="defaultLanguage"
            defaultValue={p?.defaultLanguage ?? locale}
            disabled={!canEdit}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {te(`language.${l}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="staffLanguage" label={t("staffLanguage")}>
          <NativeSelect
            id="staffLanguage"
            name="staffLanguage"
            defaultValue={p?.staffLanguage ?? locale}
            disabled={!canEdit}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {te(`language.${l}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="currency" label={t("currency")}>
          <NativeSelect
            id="currency"
            name="currency"
            defaultValue={p?.currency ?? defaults.cur}
            disabled={!canEdit}
          >
            <option value="KRW">KRW</option>
            <option value="JPY">JPY</option>
          </NativeSelect>
        </Field>
        <Field id="phone" label={t("phone")}>
          <Input id="phone" name="phone" defaultValue={p?.phone ?? ""} disabled={!canEdit} />
        </Field>
        <Field id="checkInTime" label={t("checkInTime")}>
          <Input
            id="checkInTime"
            name="checkInTime"
            type="time"
            defaultValue={p?.checkInTime ?? "15:00"}
            required
            disabled={!canEdit}
          />
        </Field>
        <Field id="checkOutTime" label={t("checkOutTime")}>
          <Input
            id="checkOutTime"
            name="checkOutTime"
            type="time"
            defaultValue={p?.checkOutTime ?? "11:00"}
            required
            disabled={!canEdit}
          />
        </Field>
      </div>
      <Feedback state={state} />
      {canEdit ? (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("next")}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("ownerOnly")}</p>
      )}
    </form>
  );
}

export function RoomStep({
  locale,
  propertyId,
  currency,
}: {
  locale: string;
  propertyId: string;
  currency: string;
}) {
  const t = useTranslations("onboarding");
  const tr = useTranslations("rooms");
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    addRoomTypeStep,
    undefined,
  );
  return (
    <form action={action} className="flex flex-col gap-3 border-t pt-4" data-testid="room-step">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="grid gap-3 sm:grid-cols-5">
        <Field id="roomName" label={t("roomName")}>
          <Input id="roomName" name="roomName" required />
        </Field>
        <Field id="capacity" label={tr("capacity")}>
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            max={20}
            defaultValue={2}
            required
          />
        </Field>
        <Field id="pricingModel" label={tr("pricingModel")}>
          <NativeSelect id="pricingModel" name="pricingModel" defaultValue="PER_ROOM">
            <option value="PER_ROOM">{tr("PER_ROOM")}</option>
            <option value="PER_PERSON">{tr("PER_PERSON")}</option>
          </NativeSelect>
        </Field>
        <Field id="baseRate" label={tr("baseRate", { currency })}>
          <Input id="baseRate" name="baseRate" type="number" min={0} required />
        </Field>
        <Field id="totalRooms" label={tr("totalRooms")}>
          <Input
            id="totalRooms"
            name="totalRooms"
            type="number"
            min={0}
            defaultValue={1}
            required
          />
        </Field>
      </div>
      <Feedback state={state} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {t("addRoom")}
        </Button>
      </div>
    </form>
  );
}

export function KnowledgeStep({
  locale,
  propertyId,
  templates,
}: {
  locale: string;
  propertyId: string;
  templates: { id: string; question: string; hint: string; added: boolean }[];
}) {
  const t = useTranslations("onboarding");
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    saveKnowledgeStep,
    undefined,
  );
  return (
    <form action={action} className="flex flex-col gap-4" data-testid="knowledge-step">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="propertyId" value={propertyId} />
      {templates.map((tpl) => (
        <div key={tpl.id} className="grid gap-1">
          <Label htmlFor={`answer_${tpl.id}`}>
            {tpl.question}
            {tpl.added ? (
              <span className="text-xs text-muted-foreground"> · {t("alreadyAdded")}</span>
            ) : null}
          </Label>
          <Textarea
            id={`answer_${tpl.id}`}
            name={`answer_${tpl.id}`}
            rows={2}
            placeholder={tpl.hint}
            disabled={tpl.added}
          />
        </div>
      ))}
      <Feedback state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("saveKnowledge")}
        </Button>
      </div>
    </form>
  );
}
