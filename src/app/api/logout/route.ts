import { AUTH_COOKIE } from "@/lib/auth";
import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.headers.append("Set-Cookie", clearSessionCookie());
  return res;
}
