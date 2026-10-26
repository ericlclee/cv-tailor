import { z } from "zod";
import { handler, HttpError } from "@/lib/http";
import { passwordsEnabled } from "@/lib/session";
import { requestPasswordLink } from "@/lib/users";

const body = z.object({ email: z.string().trim().email("Enter a valid email address.") });

// Email a set-password link. The answer is the same whether or not the email may sign in.
export const POST = handler(async (req: Request) => {
  if (!passwordsEnabled()) throw new HttpError(404, "Email and password sign-in isn't set up.");
  const { email } = body.parse(await req.json());
  try {
    await requestPasswordLink(email, (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, ""));
  } catch (err) {
    console.error(err);
    throw new HttpError(502, "The email couldn't be sent. Try again in a moment.");
  }
  return { ok: true };
});
