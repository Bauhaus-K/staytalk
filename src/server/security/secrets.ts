import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for channel credentials stored in the database.
 * Key: APP_ENCRYPTION_KEY = 32 random bytes, base64 (`openssl rand -base64 32`).
 * Format: "v1.<iv>.<tag>.<ciphertext>" (base64url parts).
 */
function key(raw: string | undefined): Buffer {
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes (base64)");
  return buf;
}

export function encryptSecret(plain: string, rawKey = process.env.APP_ENCRYPTION_KEY): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decryptSecret(token: string, rawKey = process.env.APP_ENCRYPTION_KEY): string {
  const [version, iv, tag, data] = token.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined)
    throw new Error("Invalid secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
