import crypto from "node:crypto";

import { settingsRepo } from "./db";

/**
 * Symmetric-encryption helpers for secrets that we must persist but still be
 * able to read back on the server (Hik-Connect passwords, future cloud API
 * keys, etc.).
 *
 * Key source, in order of preference:
 *   1. process.env.HIKCONNECT_SECRET (hex string, 32 bytes = 64 hex chars)
 *   2. settings table, key "instance_secret" (auto-generated on first use).
 *
 * Ciphertext format: "v1.<iv_b64>.<tag_b64>.<data_b64>" — all base64url.
 */

const K_INSTANCE_SECRET = "instance_secret";
const ENCODING = "base64url";
const ALGO = "aes-256-gcm";

let _cachedKey: Buffer | null = null;

function key(): Buffer {
  if (_cachedKey) return _cachedKey;
  const envHex = process.env.HIKCONNECT_SECRET;
  if (envHex && /^[0-9a-fA-F]{64}$/.test(envHex)) {
    _cachedKey = Buffer.from(envHex, "hex");
    return _cachedKey;
  }
  const stored = settingsRepo.get(K_INSTANCE_SECRET);
  if (stored && /^[0-9a-fA-F]{64}$/.test(stored)) {
    _cachedKey = Buffer.from(stored, "hex");
    return _cachedKey;
  }
  const fresh = crypto.randomBytes(32);
  settingsRepo.set(K_INSTANCE_SECRET, fresh.toString("hex"));
  // eslint-disable-next-line no-console
  console.warn(
    "[crypto] Generated a new instance secret. Back up the `settings` table (or set HIKCONNECT_SECRET in .env.local) or stored credentials will become unreadable after a DB wipe."
  );
  _cachedKey = fresh;
  return _cachedKey;
}

export function encryptString(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString(ENCODING),
    tag.toString(ENCODING),
    data.toString(ENCODING),
  ].join(".");
}

export function decryptString(ciphertext: string): string {
  const parts = ciphertext.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid ciphertext format.");
  }
  const iv = Buffer.from(parts[1], ENCODING);
  const tag = Buffer.from(parts[2], ENCODING);
  const data = Buffer.from(parts[3], ENCODING);
  const decipher = crypto.createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}
