import type { DbClient } from "@/server/db/client";
import { expirePendingBookings } from "@/server/services/booking";
import { closeIdleConversations } from "@/server/services/lifecycle";
import { maskOldConversations } from "@/server/services/retention";
import { getEmbedder } from "@/server/embeddings";
import { embedAllKnowledge } from "@/server/services/knowledge-embeddings";

/** Batch jobs runnable from cron routes and `pnpm job <name>`. */
export const JOBS = {
  "expire-bookings": (client: DbClient) => expirePendingBookings(client),
  "close-idle-conversations": (client: DbClient) => closeIdleConversations(client),
  "mask-old-conversations": (client: DbClient) =>
    maskOldConversations(client, new Date(), Number(process.env.RETENTION_DAYS) || undefined),
  "embed-knowledge": (client: DbClient) => embedAllKnowledge(client, getEmbedder()),
} as const;

export type JobName = keyof typeof JOBS;

export function isJobName(value: string): value is JobName {
  return value in JOBS;
}
