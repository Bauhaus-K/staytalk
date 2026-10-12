"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { deleteKnowledgeItem } from "@/server/actions/knowledge";

export function DeleteKnowledgeButton(props: { id: string; propertyId: string; locale: string }) {
  const t = useTranslations("knowledge");
  return (
    <form
      action={deleteKnowledgeItem}
      onSubmit={(e) => {
        if (!window.confirm(t("deleteConfirm"))) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={props.id} />
      <input type="hidden" name="propertyId" value={props.propertyId} />
      <input type="hidden" name="locale" value={props.locale} />
      <Button type="submit" size="sm" variant="ghost" className="text-destructive">
        {t("delete")}
      </Button>
    </form>
  );
}
