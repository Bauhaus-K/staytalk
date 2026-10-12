import type { BookingRequestedEvent, EscalationEvent, Notifier } from "./index";

/**
 * Staff notification channels beyond email — stubs with the final interface.
 * TODO(alimtalk): Kakao Alimtalk needs a registered sender profile and
 *   pre-approved templates (one per event type) via a provider (e.g. NHN/Kakao biz).
 * TODO(line-notify): push to staff through the property's LINE official account.
 */
export class KakaoAlimtalkNotifier implements Notifier {
  async escalationCreated(_event: EscalationEvent): Promise<void> {
    throw new Error("Kakao Alimtalk notifications are not implemented yet");
  }
  async bookingRequested(_event: BookingRequestedEvent): Promise<void> {
    throw new Error("Kakao Alimtalk notifications are not implemented yet");
  }
}

export class LineStaffNotifier implements Notifier {
  async escalationCreated(_event: EscalationEvent): Promise<void> {
    throw new Error("LINE staff notifications are not implemented yet");
  }
  async bookingRequested(_event: BookingRequestedEvent): Promise<void> {
    throw new Error("LINE staff notifications are not implemented yet");
  }
}

/** Fans out to several channels; one failing channel doesn't block the others. */
export class CompositeNotifier implements Notifier {
  constructor(private readonly notifiers: Notifier[]) {}

  async escalationCreated(event: EscalationEvent) {
    await this.all((n) => n.escalationCreated(event));
  }

  async bookingRequested(event: BookingRequestedEvent) {
    await this.all((n) => n.bookingRequested(event));
  }

  private async all(fn: (n: Notifier) => Promise<void>) {
    const results = await Promise.allSettled(this.notifiers.map(fn));
    for (const r of results)
      if (r.status === "rejected") console.error("[notify] channel failed", r.reason);
  }
}
