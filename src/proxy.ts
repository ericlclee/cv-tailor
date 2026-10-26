import { NextResponse, type NextRequest } from "next/server";
import { accountsEnabled, readSession, USER_COOKIE } from "@/lib/session";

// Sign-in gate for the web app: every page needs someone signed in, with Google or
// email and password (the cookie's signature is checked here; route handlers also
// check the user still exists). Without sign-in configured the app only runs locally,
// open to this computer; a Vercel deployment without it is refused. /mcp is left
// alone: it checks its own keys.

const OPEN = ["/login", "/set-password", "/api/auth/google", "/api/auth/google/callback", "/api/auth/password/login", "/api/auth/password/request", "/api/auth/password/set"];

const SETUP_NEEDED =
  "CV Tailor is locked: set up sign-in (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, and/or RESEND_API_KEY for email and password) plus SESSION_SECRET and OWNER_EMAIL in your Vercel project settings, then redeploy. See the README.";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!accountsEnabled()) return process.env.VERCEL ? new NextResponse(SETUP_NEEDED, { status: 503 }) : NextResponse.next();
  if (!process.env.SESSION_SECRET) return new NextResponse(SETUP_NEEDED, { status: 503 });
  if (OPEN.includes(pathname) || readSession(req.cookies.get(USER_COOKIE)?.value) !== null) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to CV Tailor first." }, { status: 401 });
  const login = new URL("/login", req.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets, the favicon and the MCP endpoint.
  matcher: ["/((?!_next/|favicon.ico|mcp).*)"],
};
