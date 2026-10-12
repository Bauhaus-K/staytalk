"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { NativeSelect } from "@/components/ui/native-select";

type Props = {
  properties: { id: string; name: string }[];
  activeId: string;
};

/** Switches the `?property=` query param of the current page. */
export function PropertySwitcher({ properties, activeId }: Props) {
  const t = useTranslations("property");
  const router = useRouter();
  const pathname = usePathname();
  if (properties.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("label")}</span>
      <NativeSelect
        className="w-auto"
        value={activeId}
        onChange={(e) => router.push(`${pathname}?property=${e.target.value}`)}
      >
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
