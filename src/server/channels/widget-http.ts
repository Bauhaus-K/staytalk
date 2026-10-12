import "server-only";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { WebWidgetAdapter } from "./widget";

export function widgetSecret(): string {
  if (!env.AUTH_SECRET) throw new Error("AUTH_SECRET is required for widget sessions");
  return env.AUTH_SECRET;
}

export function widgetAdapter() {
  return new WebWidgetAdapter(prisma, widgetSecret(), env.APP_URL);
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init.headers },
  });
}
