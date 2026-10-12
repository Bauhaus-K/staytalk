import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { routing } from "@/i18n/routing";
import { prisma } from "@/server/db/client";
import { frameAncestors } from "@/server/security/origin";
import { getWidgetProperty } from "@/server/services/widget";

const intl = createIntlMiddleware(routing);

const PUBLIC_PATHS = ["/login"];

function stripLocale(pathname: string): { locale: string; rest: string } {
  const [, maybeLocale, ...rest] = pathname.split("/");
  if ((routing.locales as readonly string[]).includes(maybeLocale ?? "")) {
    return { locale: maybeLocale!, rest: `/${rest.join("/")}` };
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

/**
 * Guest widget frame: only the property's whitelisted sites may embed it.
 * Enforced by the browser through CSP frame-ancestors.
 */
async function widgetFrame(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const property = await getWidgetProperty(prisma, key);
  if (!property) return new NextResponse("Unknown widget key", { status: 404 });
  const response = NextResponse.next();
  response.headers.set(
    "Content-Security-Policy",
    `frame-ancestors ${frameAncestors(property.allowedOrigins)}`,
  );
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

// Optimistic auth gate for dashboard pages. Real authorization happens in the
// data-access layer (src/server/auth/session.ts).
const dashboard = auth((req) => {
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

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.nextUrl.pathname === "/widget/frame") return widgetFrame(request);
  // Auth.js' wrapper types its second argument as a route context; in a proxy it is the fetch event.
  return dashboard(request, event as unknown as Parameters<typeof dashboard>[1]);
}

export const config = {
  // Skip API routes, Next internals and static files; the widget frame gets its own handling.
  matcher: ["/((?!api|_next|_vercel|widget|.*\\..*).*)", "/widget/frame"],
};
