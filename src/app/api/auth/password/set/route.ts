import { z } from "zod";
import { handler, HttpError } from "@/lib/http";
import { accountsEnabled, sessionCookie } from "@/lib/session";
import { setPasswordFromLink } from "@/lib/users";

const body = z.object({ token: z.string(), password: z.string() });

// Set a password from a link the owner made, and sign in.
export const POST = handler(async (req: Request) => {
  if (!accountsEnabled()) throw new HttpError(404, "Sign-in isn't set up.");
  const { token, password } = body.parse(await req.json());
  const user = await setPasswordFromLink(token, password);
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", sessionCookie(user.id));
  return res;
});
