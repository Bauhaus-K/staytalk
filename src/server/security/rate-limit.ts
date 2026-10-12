/**
 * Fixed-window rate limiter. The interface allows swapping the in-memory
 * store for a shared one (e.g. Upstash/Redis) when running multiple instances;
 * the in-memory version is per-process, which is fine for the MVP.
 */
export interface RateLimiter {
  /** Returns true if the call is allowed (and counts it). */
  take(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async take(key: string, limit: number, windowMs: number): Promise<boolean> {
    const t = this.now();
    const current = this.windows.get(key);
    if (!current || t - current.start >= windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      this.sweep(t, windowMs);
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }

  // Bound memory: drop expired windows occasionally.
  private sweep(t: number, windowMs: number) {
    if (this.windows.size < 10_000) return;
    for (const [key, w] of this.windows) {
      if (t - w.start >= windowMs) this.windows.delete(key);
    }
  }
}

let limiter: RateLimiter = new MemoryRateLimiter();

export function getRateLimiter(): RateLimiter {
  return limiter;
}

export function setRateLimiter(next: RateLimiter) {
  limiter = next;
}

/** Limits for the public widget API. */
export const WIDGET_LIMITS = {
  sessionPerIp: { limit: 30, windowMs: 60_000 },
  messagesPerSession: { limit: 12, windowMs: 60_000 },
  messagesPerIp: { limit: 40, windowMs: 60_000 },
  pollPerSession: { limit: 60, windowMs: 60_000 },
} as const;
