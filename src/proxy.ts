import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, passwordRequired, validSession } from "@/lib/auth";

// Password gate for the web app. Off when APP_PASSWORD isn't set (local use),
// except on Vercel, where a public deployment without a password is refused.
// /mcp is left alone: it checks MCP_TOKEN itself.

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  if (!passwordRequired()) {
    if (!process.env.VERCEL) return NextResponse.next();
    return new NextResponse("CV Tailor is locked: set APP_PASSWORD in your Vercel project settings, then redeploy.", { status: 503 });
  }
  if (validSession(req.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to CV Tailor first." }, { status: 401 });
  const login = new URL("/login", req.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets, the favicon and the MCP endpoint.
  matcher: ["/((?!_next/|favicon.ico|mcp).*)"],
};
