"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const LABELS: Record<(typeof routing.locales)[number], string> = {
  ko: "한국어",
  ja: "日本語",
  en: "English",
};

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav className={cn("flex justify-center gap-3 text-sm", className)} aria-label="Language">
      {routing.locales.map((l) => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          aria-current={l === locale ? "true" : undefined}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            l === locale && "font-semibold text-foreground",
          )}
        >
          {LABELS[l]}
        </Link>
      ))}
    </nav>
  );
}
