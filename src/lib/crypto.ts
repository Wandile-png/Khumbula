import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * POPIA: ID numbers are special personal information in practice (they reveal age, sex, citizenship).
 * We store them encrypted (AES-256-GCM) plus an HMAC for lookups, never in plain text.
 * DATA_KEY: 32 random bytes, base64. Generate with: openssl rand -base64 32
 */
function dataKey(): Buffer {
  const k = process.env.DATA_KEY;
  if (!k) throw new Error("DATA_KEY is not set");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("DATA_KEY must be 32 bytes, base64-encoded");
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(token: string): string {
  const [v, iv, tag, enc] = token.split(".");
  if (v !== "v1") throw new Error("Unknown ciphertext version");
  const d = createDecipheriv("aes-256-gcm", dataKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}

export function lookupHash(value: string): string {
  return createHmac("sha256", dataKey()).update("lookup:" + value).digest("hex");
}

export function maskId(id: string): string {
  return id.slice(0, 6) + "•••••" + id.slice(-2);
}

export function otpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(code: string, salt: string): string {
  return createHmac("sha256", dataKey()).update(`otp:${salt}:${code}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Encrypt raw bytes (uploaded files). Layout: 12-byte IV | 16-byte tag | ciphertext. */
export function encryptBytes(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptBytes(blob: Buffer | Uint8Array): Buffer {
  const b = Buffer.from(blob);
  const d = createDecipheriv("aes-256-gcm", dataKey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]);
}
