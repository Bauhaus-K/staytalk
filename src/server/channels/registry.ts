import type { Channel } from "@/generated/prisma/enums";
import type { DeliveryTarget } from "./types";

/**
 * Push delivery of staff/AI messages to channels that need it. The web
 * widget is pull-based (polling), so nothing happens there; LINE (Phase 4)
 * registers a pusher here.
 */
export type Pusher = (target: DeliveryTarget, messages: { text: string }[]) => Promise<void>;

const pushers = new Map<Channel, Pusher>();

export function registerPusher(channel: Channel, pusher: Pusher) {
  pushers.set(channel, pusher);
}

export async function deliverToGuest(
  channel: Channel,
  target: DeliveryTarget,
  messages: { text: string }[],
): Promise<void> {
  const pusher = pushers.get(channel);
  if (pusher) await pusher(target, messages);
}
