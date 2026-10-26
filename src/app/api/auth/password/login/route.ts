import { z } from "zod";
import { handler, HttpError } from "@/lib/http";
import { passwordsEnabled, sessionCookie } from "@/lib/session";
import { passwordSignIn } from "@/lib/users";

const body = z.object({ email: z.string(), password: z.string() });

export const POST = handler(async (req: Request) => {
  if (!passwordsEnabled()) throw new HttpError(404, "Email and password sign-in isn't set up.");
  const { email, password } = body.parse(await req.json());
  const user = await passwordSignIn(email, password);
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", sessionCookie(user.id));
  return res;
});
