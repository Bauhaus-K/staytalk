import { describe, expect, it } from "vitest";
import { frameAncestors, isSameOriginRequest, normalizeOrigin } from "./origin";
import { MemoryRateLimiter } from "./rate-limit";
import { issueWidgetToken, verifyWidgetToken } from "./widget-token";

describe("widget token", () => {
  const payload = { o: "org", p: "prop", s: "sess" };

  it("round-trips and rejects tampering or a wrong secret", () => {
    const token = issueWidgetToken(payload, "secret");
    expect(verifyWidgetToken(token, "secret")).toMatchObject(payload);
    expect(verifyWidgetToken(token, "other")).toBeNull();
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, p: "victim", iat: 0 })).toString(
      "base64url",
    );
    expect(verifyWidgetToken(`${forged}.${sig}`, "secret")).toBeNull();
    expect(verifyWidgetToken(`${body}.`, "secret")).toBeNull();
    expect(verifyWidgetToken("garbage", "secret")).toBeNull();
  });

  it("expires after 30 days", () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const token = issueWidgetToken(payload, "secret", issued);
    expect(verifyWidgetToken(token, "secret", new Date("2026-01-20T00:00:00Z"))).not.toBeNull();
    expect(verifyWidgetToken(token, "secret", new Date("2026-02-15T00:00:00Z"))).toBeNull();
  });
});

describe("origin checks", () => {
  it("normalizes origins", () => {
    expect(normalizeOrigin("https://Example.com:443/path")).toBe("https://example.com");
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("not a url")).toBeNull();
  });

  it("recognizes same-origin browser requests with or without an Origin header", () => {
    const app = "http://localhost:3000";
    expect(isSameOriginRequest(new Headers({ origin: app }), app)).toBe(true);
    expect(isSameOriginRequest(new Headers({ origin: "https://evil.example" }), app)).toBe(false);
    expect(isSameOriginRequest(new Headers({ "sec-fetch-site": "same-origin" }), app)).toBe(true);
    expect(isSameOriginRequest(new Headers({ "sec-fetch-site": "cross-site" }), app)).toBe(false);
    expect(isSameOriginRequest(new Headers(), app)).toBe(false);
  });

  it("builds frame-ancestors", () => {
    expect(frameAncestors(["https://a.example/", "bad", "https://a.example"])).toBe(
      "'self' https://a.example",
    );
  });
});

describe("MemoryRateLimiter", () => {
  it("allows up to the limit per window", async () => {
    let now = 0;
    const rl = new MemoryRateLimiter(() => now);
    expect(await rl.take("k", 2, 1000)).toBe(true);
    expect(await rl.take("k", 2, 1000)).toBe(true);
    expect(await rl.take("k", 2, 1000)).toBe(false);
    expect(await rl.take("other", 2, 1000)).toBe(true);
    now = 1000;
    expect(await rl.take("k", 2, 1000)).toBe(true);
  });
});
