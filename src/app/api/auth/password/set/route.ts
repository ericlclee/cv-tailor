import { z } from "zod";
import { handler, HttpError } from "@/lib/http";
import { passwordsEnabled, sessionCookie } from "@/lib/session";
import { setPasswordFromLink } from "@/lib/users";

const body = z.object({ token: z.string(), password: z.string() });

// Set a password from an emailed link, and sign in.
export const POST = handler(async (req: Request) => {
  if (!passwordsEnabled()) throw new HttpError(404, "Email and password sign-in isn't set up.");
  const { token, password } = body.parse(await req.json());
  const user = await setPasswordFromLink(token, password);
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", sessionCookie(user.id));
  return res;
});
