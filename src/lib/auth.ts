import { createHash, timingSafeEqual } from "node:crypto";

// A single shared password for the web app (APP_PASSWORD). The browser keeps a
// cookie holding a hash of it; changing the password signs everyone out.
// The MCP endpoint is protected separately, by MCP_TOKEN.

export const AUTH_COOKIE = "cvt_session";
export const SESSION_DAYS = 30;

export const passwordRequired = () => Boolean(process.env.APP_PASSWORD);

export function sessionValue() {
  return createHash("sha256").update(`cv-tailor-session:${process.env.APP_PASSWORD ?? ""}`).digest("hex");
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const validSession = (cookie: string | undefined) => !!cookie && same(cookie, sessionValue());

export const validPassword = (given: string) => passwordRequired() && same(given, process.env.APP_PASSWORD!);
