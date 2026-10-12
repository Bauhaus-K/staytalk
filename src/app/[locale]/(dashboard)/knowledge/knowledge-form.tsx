"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { saveKnowledgeItem, type KnowledgeFormState } from "@/server/actions/knowledge";

const CATEGORIES = [
  "HOUSE_RULES",
  "CHECKIN",
  "FACILITY",
  "TRANSPORT",
  "NEARBY",
  "FAQ",
  "POLICY",
] as const;
const LANGUAGES = ["ko", "ja", "en", "zh-CN", "zh-TW"] as const;

type Props = {
  locale: string;
  propertyId: string;
  item?: {
    id: string;
    category: (typeof CATEGORIES)[number];
    question: string;
    content: string;
    language: string;
    active: boolean;
  };
  defaultLanguage: string;
  /** Pre-fill from an unanswered guest question. */
  fromEscalation?: { id: string; question: string };
};

export function KnowledgeForm({
  locale,
  propertyId,
  item,
  defaultLanguage,
  fromEscalation,
}: Props) {
  const t = useTranslations("knowledge");
  const te = useTranslations("enums");
  const [state, action, pending] = useActionState<KnowledgeFormState, FormData>(
    saveKnowledgeItem,
    undefined,
  );
  const fieldError = (key: "question" | "content" | "category" | "language") => {
    const code = state?.fieldErrors?.[key];
    return code ? (
      <p className="text-sm text-destructive" role="alert">
        {t(`errors.${code}`)}
      </p>
    ) : null;
  };

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="propertyId" value={propertyId} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {fromEscalation ? (
        <input type="hidden" name="escalationId" value={fromEscalation.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="category">{t("category")}</Label>
          <NativeSelect id="category" name="category" defaultValue={item?.category ?? "FAQ"}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {te(`category.${c}`)}
              </option>
            ))}
          </NativeSelect>
          {fieldError("category")}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="language">{t("language")}</Label>
          <NativeSelect
            id="language"
            name="language"
            defaultValue={item?.language ?? defaultLanguage}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {te(`language.${l}`)}
              </option>
            ))}
          </NativeSelect>
          {fieldError("language")}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="question">{t("question")}</Label>
        <Input
          id="question"
          name="question"
          defaultValue={item?.question ?? fromEscalation?.question}
          placeholder={t("questionHint")}
          maxLength={200}
          required
        />
        {fieldError("question")}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="content">{t("content")}</Label>
        <Textarea
          id="content"
          name="content"
          defaultValue={item?.content}
          placeholder={t("contentHint")}
          rows={6}
          maxLength={4000}
          required
        />
        {fieldError("content")}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={item?.active ?? true} />
        {t("active")}
      </label>

      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {t("errors.generic")}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        <Button asChild variant="outline">
          <Link href={`/knowledge?property=${propertyId}`}>{t("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
