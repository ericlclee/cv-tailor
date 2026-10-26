import { z } from "zod";
import { handler, HttpError } from "@/lib/http";
import { accountsEnabled, sessionCookie } from "@/lib/session";
import { passwordSignIn } from "@/lib/users";

const body = z.object({ email: z.string(), password: z.string() });

export const POST = handler(async (req: Request) => {
  if (!accountsEnabled()) throw new HttpError(404, "Sign-in isn't set up.");
  const { email, password } = body.parse(await req.json());
  const user = await passwordSignIn(email, password);
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", sessionCookie(user.id));
  return res;
});
