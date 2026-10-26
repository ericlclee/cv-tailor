import { z } from "zod";
import { handler } from "@/lib/http";
import { createPasswordLink, requireOwner } from "@/lib/users";

const body = z.object({ email: z.string().trim().email("Enter a valid email address.") });

// Make a one-time link for someone to set or reset their password (owner only).
export const POST = handler(async (req: Request) => {
  await requireOwner();
  return createPasswordLink(body.parse(await req.json()).email, (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, ""));
});
