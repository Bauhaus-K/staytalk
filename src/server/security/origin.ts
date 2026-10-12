/** Normalizes an origin string ("https://Example.com:443/" → "https://example.com"). */
export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

/** CSP `frame-ancestors` value allowing the property's sites to embed the widget frame. */
export function frameAncestors(allowedOrigins: string[]): string {
  const origins = allowedOrigins.map(normalizeOrigin).filter((o): o is string => Boolean(o));
  return ["'self'", ...new Set(origins)].join(" ");
}

/**
 * True for browser requests from our own pages (the widget iframe). Browsers
 * send Origin on POST but not on same-origin GET; for those, Fetch Metadata
 * (`Sec-Fetch-Site: same-origin`) identifies the initiator.
 */
export function isSameOriginRequest(headers: Headers, appOrigin: string): boolean {
  const origin = headers.get("origin");
  if (origin) return normalizeOrigin(origin) === normalizeOrigin(appOrigin);
  return headers.get("sec-fetch-site") === "same-origin";
}
