import { startSignIn } from "@/lib/google";
import { accountsEnabled } from "@/lib/session";

// Start Google sign-in. ?next= is where to land afterwards.
export function GET(req: Request) {
  if (!accountsEnabled()) return Response.redirect(new URL("/login", req.url), 302);
  const { location, cookie } = startSignIn(req);
  return new Response(null, { status: 302, headers: { Location: location, "Set-Cookie": cookie } });
}
