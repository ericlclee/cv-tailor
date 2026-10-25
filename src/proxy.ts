import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, passwordRequired, validSession } from "@/lib/auth";
import { accountsEnabled, readSession, USER_COOKIE } from "@/lib/session";

// Sign-in gate for the web app. With Google sign-in configured, every page needs a
// signed-in user (the cookie's signature is checked here; route handlers also check
// the user still exists). Otherwise the single-user APP_PASSWORD gate applies; it's
// off locally without a password, and a public Vercel deployment without either
// is refused. /mcp is left alone: it checks its own keys.

const OPEN = ["/login", "/api/login", "/api/auth/google", "/api/auth/google/callback"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (OPEN.includes(pathname) || pathname.startsWith("/invite/")) return NextResponse.next();

  let signedIn: boolean;
  if (accountsEnabled()) {
    if (!process.env.SESSION_SECRET) return new NextResponse("CV Tailor is locked: set SESSION_SECRET in your Vercel project settings, then redeploy.", { status: 503 });
    signedIn = readSession(req.cookies.get(USER_COOKIE)?.value) !== null;
  } else if (passwordRequired()) {
    signedIn = validSession(req.cookies.get(AUTH_COOKIE)?.value);
  } else if (process.env.VERCEL) {
    return new NextResponse("CV Tailor is locked: set up Google sign-in (or APP_PASSWORD) in your Vercel project settings, then redeploy.", { status: 503 });
  } else {
    return NextResponse.next();
  }
  if (signedIn) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to CV Tailor first." }, { status: 401 });
  const login = new URL("/login", req.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets, the favicon and the MCP endpoint.
  matcher: ["/((?!_next/|favicon.ico|mcp).*)"],
};
