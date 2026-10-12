import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { isJobName, JOBS } from "@/server/jobs";
import { ensureRuntime } from "@/server/services/runtime";

function authorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Runs a batch job (`/api/cron/expire-bookings`, ...). Vercel Cron calls with GET. */
export async function GET(request: Request, { params }: RouteContext<"/api/cron/[job]">) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  if (!isJobName(job)) return Response.json({ error: "unknown_job" }, { status: 404 });
  ensureRuntime(); // jobs may message guests (e.g. LINE push on expiry)
  return Response.json(await JOBS[job](prisma));
}
