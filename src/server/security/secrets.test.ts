import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secrets";

const key = randomBytes(32).toString("base64");

describe("secrets", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("channel-secret", key);
    const b = encryptSecret("channel-secret", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("channel-secret");
    expect(decryptSecret(a, key)).toBe("channel-secret");
  });

  it("rejects tampering and wrong keys", () => {
    const token = encryptSecret("x", key);
    const [v, iv, tag, data] = token.split(".");
    const flipped = Buffer.from(data!, "base64url");
    flipped[0]! ^= 1;
    expect(() =>
      decryptSecret([v, iv, tag, flipped.toString("base64url")].join("."), key),
    ).toThrow();
    expect(() => decryptSecret(token, randomBytes(32).toString("base64"))).toThrow();
    expect(() => encryptSecret("x", "short")).toThrow(/32 bytes/);
  });
});
