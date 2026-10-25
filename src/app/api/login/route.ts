import { z } from "zod";
import { AUTH_COOKIE, passwordRequired, SESSION_DAYS, sessionValue, validPassword } from "@/lib/auth";
import { handler, HttpError } from "@/lib/http";

const body = z.object({ password: z.string() });

export const POST = handler(async (req: Request) => {
  if (!passwordRequired()) return { ok: true };
  // Slow down guessing a little.
  await new Promise((r) => setTimeout(r, 400));
  if (!validPassword(body.parse(await req.json()).password)) throw new HttpError(401, "That password isn't right.");
  const res = Response.json({ ok: true });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.headers.append("Set-Cookie", `${AUTH_COOKIE}=${sessionValue()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  return res;
});
