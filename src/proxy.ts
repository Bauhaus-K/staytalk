import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { routing } from "@/i18n/routing";

const intl = createIntlMiddleware(routing);

const PUBLIC_PATHS = ["/login"];

function stripLocale(pathname: string): { locale: string; rest: string } {
  const [, maybeLocale, ...rest] = pathname.split("/");
  if ((routing.locales as readonly string[]).includes(maybeLocale ?? "")) {
    return { locale: maybeLocale!, rest: `/${rest.join("/")}` };
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

// Optimistic auth gate for dashboard pages. Real authorization happens in the
// data-access layer (src/server/auth/session.ts).
export default auth((req) => {
  const { locale, rest } = stripLocale(req.nextUrl.pathname);
  const isPublic = PUBLIC_PATHS.some((p) => rest === p || rest.startsWith(`${p}/`));

  if (!req.auth && !isPublic) {
    const url = new URL(`/${locale}/login`, req.nextUrl.origin);
    if (rest !== "/") url.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (req.auth && isPublic) {
    return NextResponse.redirect(new URL(`/${locale}`, req.nextUrl.origin));
  }
  return intl(req);
});

export const config = {
  // Skip API routes, Next internals, the guest widget and static files.
  matcher: ["/((?!api|_next|_vercel|widget|.*\\..*).*)"],
};
