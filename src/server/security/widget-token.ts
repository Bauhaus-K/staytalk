import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Stateless widget session token: base64url(JSON payload) + "." + HMAC-SHA256.
 * Identifies an anonymous guest session for one property. Not a secret-bearing
 * credential beyond that: it only grants chatting as that guest session.
 */
export type WidgetTokenPayload = {
  /** organizationId */
  o: string;
  /** propertyId */
  p: string;
  /** guest session id */
  s: string;
  /** issued at (seconds) */
  iat: number;
};

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days: returning guests keep their thread

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string) {
  return createHmac("sha256", `widget:${secret}`).update(data).digest("base64url");
}

export function newGuestSessionId(): string {
  return randomBytes(16).toString("base64url");
}

export function issueWidgetToken(
  payload: Omit<WidgetTokenPayload, "iat">,
  secret: string,
  now = new Date(),
): string {
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(now.getTime() / 1000) }));
  return `${body}.${sign(body, secret)}`;
}

export function verifyWidgetToken(
  token: string | null | undefined,
  secret: string,
  now = new Date(),
): WidgetTokenPayload | null {
  if (!token || token.length > 1024) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as WidgetTokenPayload;
    if (
      typeof payload.o !== "string" ||
      typeof payload.p !== "string" ||
      typeof payload.s !== "string"
    ) {
      return null;
    }
    if (Math.floor(now.getTime() / 1000) - payload.iat > MAX_AGE_SECONDS) return null;
    return payload;
  } catch {
    return null;
  }
}
