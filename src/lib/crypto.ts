import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY env var is required (32-byte base64 string).",
    );
  }
  // Accept either base64 32-byte material or any string we hash to 32 bytes.
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return createHash("sha256").update(raw, "utf8").digest();
}

/** Encrypts a UTF-8 string. Returns base64 of `iv || tag || ciphertext`. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Decrypts a value produced by encryptSecret(). */
export function decryptSecret(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Ciphertext too short");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString("utf8");
}

/** Returns the last `n` chars of a key, padded for very short inputs. */
export function maskKey(key: string, n = 4): string {
  if (key.length <= n) return "*".repeat(key.length);
  return key.slice(-n);
}
