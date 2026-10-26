import type { NextRequest } from "next/server";
import { finishSignIn, OAUTH_COOKIE, SignInFailed } from "@/lib/google";
import { sessionCookie } from "@/lib/session";
import { NotApproved, signIn } from "@/lib/users";

// Google sends people back here. Sign them in if they're the owner, already a user,
// or approved by the owner; otherwise back to the sign-in page with the reason.
export async function GET(req: NextRequest) {
  const fail = (reason: string) => {
    const to = new URL("/login", req.url);
    to.searchParams.set("error", reason);
    return new Response(null, { status: 302, headers: [["Location", to.toString()], ["Set-Cookie", `${OAUTH_COOKIE}=; Path=/api/auth; Max-Age=0`]] });
  };
  try {
    const { profile, next } = await finishSignIn(req, req.cookies.get(OAUTH_COOKIE)?.value);
    const user = await signIn(profile);
    return new Response(null, {
      status: 302,
      headers: [
        ["Location", new URL(next, req.url).toString()],
        ["Set-Cookie", sessionCookie(user.id)],
        ["Set-Cookie", `${OAUTH_COOKIE}=; Path=/api/auth; Max-Age=0`],
      ],
    });
  } catch (err) {
    if (err instanceof NotApproved) return fail("not_approved");
    if (err instanceof SignInFailed) return fail(err.message);
    console.error(err);
    return fail("failed");
  }
}
