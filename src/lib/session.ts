import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";

// Who a request belongs to.
//
// Two modes:
// - Accounts (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set): people sign in with
//   Google, by invitation. The browser holds a signed cookie with the user's id;
//   chat apps send their own MCP key, and the MCP route runs the request as that user.
// - Single user (no Google settings): everything belongs to one built-in user, behind
//   the optional APP_PASSWORD gate (see auth.ts). This is how the app ran before
//   accounts, and local development still runs this way.

export const USER_COOKIE = "cvt_user";
export const SESSION_DAYS = 30;
/** The one user in single-user mode. Their data moves to the owner when accounts are turned on. */
export const LOCAL_USER_ID = "local";

export const accountsEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

function sign(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Set SESSION_SECRET to a long random string to turn on accounts.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A tamper-proof value: "<payload>.<signature>". */
export function sealed(payload: string) {
  return `${payload}.${sign(payload)}`;
}

/** The payload of a sealed value, or null if it was tampered with. */
export function unseal(value: string | undefined): string | null {
  if (!value || !process.env.SESSION_SECRET) return null;
  const i = value.lastIndexOf(".");
  if (i < 1) return null;
  const payload = value.slice(0, i);
  return same(value.slice(i + 1), sign(payload)) ? payload : null;
}

export function sessionCookie(userId: string) {
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${USER_COOKIE}=${sealed(`${userId}~${expires}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export const clearSessionCookie = () => `${USER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** The user id in a session cookie, if it's genuine and unexpired. */
export function readSession(value: string | undefined): string | null {
  const payload = unseal(value);
  if (!payload) return null;
  const [userId, expires] = payload.split("~");
  return userId && Number(expires) > Date.now() ? userId : null;
}

// Requests from chat apps run inside runAsUser, set by the MCP route once it has
// matched the key to a user. Everything else is identified by the session cookie.
const context = new AsyncLocalStorage<string>();
export const runAsUser = <T>(userId: string, fn: () => T) => context.run(userId, fn);

export class SignInRequired extends Error {
  status = 401;
  constructor() {
    super("Sign in to CV Tailor first.");
  }
}

/** The current user's id, and whether it still needs checking against the users table. */
export async function sessionUser(): Promise<{ id: string; checked: boolean }> {
  const fromChat = context.getStore();
  if (fromChat) return { id: fromChat, checked: true };
  if (!accountsEnabled()) return { id: LOCAL_USER_ID, checked: true };
  const { cookies } = await import("next/headers");
  const id = readSession((await cookies()).get(USER_COOKIE)?.value);
  if (!id) throw new SignInRequired();
  return { id, checked: false };
}
