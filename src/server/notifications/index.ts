import type { EscalationReason } from "@/generated/prisma/enums";

export type EscalationEvent = {
  organizationId: string;
  propertyId: string;
  propertyName: string;
  conversationId: string;
  escalationId: string;
  reason: EscalationReason;
  summary: string;
};

/**
 * Staff notification channel. MVP: log only (email lands in Phase 2;
 * Kakao Alimtalk / LINE later) — callers depend on this interface only.
 */
export interface Notifier {
  escalationCreated(event: EscalationEvent): Promise<void>;
}

export class LogNotifier implements Notifier {
  async escalationCreated(event: EscalationEvent) {
    console.info(
      `[notify] escalation ${event.reason} for ${event.propertyName} (conversation ${event.conversationId})`,
    );
  }
}

/** Collects events in memory; for tests. */
export class MemoryNotifier implements Notifier {
  readonly events: EscalationEvent[] = [];
  async escalationCreated(event: EscalationEvent) {
    this.events.push(event);
  }
}

let notifier: Notifier = new LogNotifier();

export function getNotifier(): Notifier {
  return notifier;
}

export function setNotifier(next: Notifier) {
  notifier = next;
}
