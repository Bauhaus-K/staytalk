import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { JOBS } from "@/server/jobs";

function authorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Expires overdue PENDING booking requests. Vercel Cron calls this with GET. */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await JOBS["expire-bookings"](prisma);
  return Response.json(result);
}
