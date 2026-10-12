import type { EscalationReason } from "@/generated/prisma/enums";

export type EscalationEvent = {
  organizationId: string;
  propertyId: string;
  propertyName: string;
  conversationId: string;
  escalationId: string;
  reason: EscalationReason;
  summary: string;
  /** Guest message that triggered it (already PII-masked). */
  question: string | null;
};

export type BookingRequestedEvent = {
  organizationId: string;
  propertyId: string;
  propertyName: string;
  conversationId: string | null;
  bookingRequestId: string;
  reference: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
};

/**
 * Staff notification channel. MVP: log only (email lands in Phase 2;
 * Kakao Alimtalk / LINE later) — callers depend on this interface only.
 */
export interface Notifier {
  escalationCreated(event: EscalationEvent): Promise<void>;
  bookingRequested(event: BookingRequestedEvent): Promise<void>;
}

export class LogNotifier implements Notifier {
  async escalationCreated(event: EscalationEvent) {
    console.info(
      `[notify] escalation ${event.reason} for ${event.propertyName} (conversation ${event.conversationId})`,
    );
  }

  async bookingRequested(event: BookingRequestedEvent) {
    console.info(`[notify] booking request ${event.reference} for ${event.propertyName}`);
  }
}

/** Collects events in memory; for tests. */
export class MemoryNotifier implements Notifier {
  readonly events: EscalationEvent[] = [];
  readonly bookings: BookingRequestedEvent[] = [];
  async escalationCreated(event: EscalationEvent) {
    this.events.push(event);
  }
  async bookingRequested(event: BookingRequestedEvent) {
    this.bookings.push(event);
  }
}

let notifier: Notifier = new LogNotifier();

export function getNotifier(): Notifier {
  return notifier;
}

export function setNotifier(next: Notifier) {
  notifier = next;
}
