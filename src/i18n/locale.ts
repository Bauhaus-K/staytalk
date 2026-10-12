import { hasLocale, type Locale } from "next-intl";
import { routing } from "./routing";

/** Narrows a route param to a supported dashboard locale (falls back to default). */
export function asLocale(value: string): Locale {
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}
