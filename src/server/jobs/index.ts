import type { DbClient } from "@/server/db/client";
import { expirePendingBookings } from "@/server/services/booking";
import { closeIdleConversations } from "@/server/services/lifecycle";

/** Batch jobs runnable from cron routes and `pnpm job <name>`. */
export const JOBS = {
  "expire-bookings": (client: DbClient) => expirePendingBookings(client),
  "close-idle-conversations": (client: DbClient) => closeIdleConversations(client),
} as const;

export type JobName = keyof typeof JOBS;

export function isJobName(value: string): value is JobName {
  return value in JOBS;
}
