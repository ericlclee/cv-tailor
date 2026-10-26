import { startSignIn } from "@/lib/google";
import { googleEnabled } from "@/lib/session";

// Start Google sign-in. ?next= is where to land afterwards.
export function GET(req: Request) {
  if (!googleEnabled()) return Response.redirect(new URL("/login", req.url), 302);
  const { location, cookie } = startSignIn(req);
  return new Response(null, { status: 302, headers: { Location: location, "Set-Cookie": cookie } });
}
