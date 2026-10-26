import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { sealed, unseal } from "./session";

// Email and password sign-in. Passwords are stored as scrypt hashes. Setting or
// resetting one always goes through a one-time link the owner makes on the People
// page and sends to the person themselves (there's no email service).

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const MIN_PASSWORD = 10;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | undefined) {
  const [kind, n, r, p, salt, hash] = (stored ?? "").split("$");
  if (kind !== "scrypt" || !hash) {
    // Spend the same time as a real check, so a missing account doesn't answer faster.
    await scrypt(password, Buffer.alloc(16), 32, PARAMS);
    return false;
  }
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem });
  return timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// Set-password links: signed, valid for a week, and only until a password is set
// (the link carries a fingerprint of the current password, or of "none").

export const LINK_DAYS = 7;
const fingerprint = (passwordHash: string | undefined) => createHash("sha256").update(passwordHash ?? "none").digest("base64url").slice(0, 16);

export function setPasswordToken(email: string, currentHash: string | undefined) {
  return sealed(Buffer.from(JSON.stringify({ e: email, x: Date.now() + LINK_DAYS * 86400_000, f: fingerprint(currentHash) })).toString("base64url"));
}

/** The email a link is for, if it's genuine and unexpired (the caller checks it's still unused). */
export function readSetPasswordToken(token: string): { email: string; fingerprint: string } | null {
  const raw = unseal(token);
  if (!raw) return null;
  try {
    const { e, x, f } = JSON.parse(Buffer.from(raw, "base64url").toString()) as { e: string; x: number; f: string };
    return x > Date.now() ? { email: e, fingerprint: f } : null;
  } catch {
    return null;
  }
}

export const linkStillUnused = (tokenFingerprint: string, currentHash: string | undefined) => tokenFingerprint === fingerprint(currentHash);
