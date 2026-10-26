import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sealed, unseal } from "./session";

// Google sign-in (OpenID Connect, authorization code flow with PKCE). The id token
// comes straight from Google's token endpoint over TLS, so its claims are trusted
// without checking its signature, as the OpenID Connect spec allows.
// GOOGLE_AUTH_URL and GOOGLE_TOKEN_URL exist only to point tests at a stand-in.

const AUTH_URL = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
export const OAUTH_COOKIE = "cvt_oauth";

/** Where Google sends people back to; register it in the Google Cloud OAuth client. */
export const callbackUrl = (req: Request) => `${(process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "")}/api/auth/google/callback`;

interface Pending {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
}

const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

/** The Google URL to send someone to, and the cookie that remembers this attempt. */
export function startSignIn(req: Request): { location: string; cookie: string } {
  const url = new URL(req.url);
  const pending: Pending = {
    state: randomBytes(16).toString("base64url"),
    nonce: randomBytes(16).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    next: safeNext(url.searchParams.get("next")),
  };
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: callbackUrl(req),
    response_type: "code",
    scope: "openid email profile",
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: createHash("sha256").update(pending.verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const value = sealed(Buffer.from(JSON.stringify(pending)).toString("base64url"));
  return { location: `${AUTH_URL()}?${params}`, cookie: `${OAUTH_COOKIE}=${value}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}` };
}

/** Why a sign-in failed, as a code the sign-in page turns into a message. */
export class SignInFailed extends Error {}

/** Finish a sign-in: check the round trip, swap the code for Google's verified profile. */
export async function finishSignIn(req: Request, cookieValue: string | undefined) {
  const url = new URL(req.url);
  const raw = unseal(cookieValue);
  if (!raw) throw new SignInFailed("expired");
  const pending = JSON.parse(Buffer.from(raw, "base64url").toString()) as Pending;
  if (url.searchParams.get("error")) throw new SignInFailed("cancelled");
  if (!url.searchParams.get("code") || url.searchParams.get("state") !== pending.state) throw new SignInFailed("expired");

  const res = await fetch(TOKEN_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code")!,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: callbackUrl(req),
      grant_type: "authorization_code",
      code_verifier: pending.verifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new SignInFailed("failed");
  const { id_token } = (await res.json()) as { id_token?: string };
  const claims = JSON.parse(Buffer.from(id_token?.split(".")[1] ?? "", "base64url").toString() || "{}") as Record<string, unknown>;
  const valid =
    ["https://accounts.google.com", "accounts.google.com"].includes(String(claims.iss)) &&
    claims.aud === process.env.GOOGLE_CLIENT_ID &&
    Number(claims.exp) * 1000 > Date.now() &&
    claims.nonce === pending.nonce &&
    claims.email_verified === true &&
    typeof claims.email === "string";
  if (!valid) throw new SignInFailed("failed");
  return { profile: { email: claims.email as string, name: String(claims.name ?? ""), picture: String(claims.picture ?? "") }, next: pending.next };
}
