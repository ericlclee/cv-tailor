import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { sealed, unseal } from "./session";

// Email and password sign-in. Passwords are stored as scrypt hashes. Setting or
// resetting one always goes through a link emailed to the address (via Resend), so
// only someone who can read that inbox can set it. RESEND_API_URL exists only to
// point tests at a stand-in.

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
// Set-password links: signed, valid for an hour, and only until a password is set
// (the link carries a fingerprint of the current password, or of "none").

const LINK_MINUTES = 60;
const fingerprint = (passwordHash: string | undefined) => createHash("sha256").update(passwordHash ?? "none").digest("base64url").slice(0, 16);

export function setPasswordToken(email: string, currentHash: string | undefined) {
  return sealed(Buffer.from(JSON.stringify({ e: email, x: Date.now() + LINK_MINUTES * 60_000, f: fingerprint(currentHash) })).toString("base64url"));
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

// ---------------------------------------------------------------------------
// Email (Resend). EMAIL_FROM must be an address on a domain verified in Resend;
// without one, Resend only delivers to the account's own email address.

export async function sendEmail(to: string, subject: string, text: string, html: string) {
  const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "CV Tailor <onboarding@resend.dev>", to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Resend refused the email (${res.status}): ${(await res.text()).slice(0, 200)}`);
}
