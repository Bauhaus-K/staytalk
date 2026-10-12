import { defineRouting } from "next-intl/routing";

// Dashboard locales. Guest-facing surfaces additionally support zh-CN / zh-TW.
export const DASHBOARD_LOCALES = ["ko", "ja", "en"] as const;
export type DashboardLocale = (typeof DASHBOARD_LOCALES)[number];

export const routing = defineRouting({
  locales: DASHBOARD_LOCALES,
  defaultLocale: "ko",
  localePrefix: "always",
});
