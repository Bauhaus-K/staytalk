import type { z } from "zod";
import type { EscalationReason } from "@/generated/prisma/enums";
import type { DbClient } from "@/server/db/client";
import type { TenantDb } from "@/server/db/tenant";
import type { Notifier } from "@/server/notifications";
import type { GuestLanguage } from "@/server/language/codes";

export type PropertyContext = {
  id: string;
  name: string;
  country: "KR" | "JP";
  defaultLanguage: string;
  staffLanguage: string;
};

/** Mutable per-run state tools can update (read by the conversation service). */
export type RunState = {
  escalation?: { id: string; reason: EscalationReason };
};

export type ToolContext = {
  organizationId: string;
  conversationId: string;
  property: PropertyContext;
  guestLanguage: GuestLanguage;
  /** Latest guest message (masked), recorded on escalations. */
  guestMessage: string;
  db: TenantDb;
  /** Unscoped client for raw SQL that applies organizationId explicitly. */
  client: DbClient;
  notifier: Notifier;
  state: RunState;
};

export type ToolDefinition<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  run(input: z.infer<S>, ctx: ToolContext): Promise<unknown>;
};

export function defineTool<S extends z.ZodType>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def;
}
