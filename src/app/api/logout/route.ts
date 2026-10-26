import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie());
  return res;
}
