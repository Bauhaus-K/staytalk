"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", key: "home" },
  { href: "/inbox", key: "inbox" },
  { href: "/bookings", key: "bookings" },
  { href: "/knowledge", key: "knowledge" },
  { href: "/rooms", key: "rooms" },
  { href: "/metrics", key: "metrics" },
  { href: "/playground", key: "playground" },
  { href: "/onboarding", key: "onboarding" },
  { href: "/settings", key: "settings" },
] as const;

export function SidebarNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 md:flex-col">
      {ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm hover:bg-accent",
              active && "bg-accent font-medium",
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
