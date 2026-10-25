import { z } from "zod";
import { handler } from "@/lib/http";
import { createInvite, requireOwner } from "@/lib/users";

const body = z.object({ email: z.string().email().or(z.literal("")).default("") });

// Create an invite link (owner only). With an email, only that Google account can use it.
export const POST = handler(async (req: Request) => {
  await requireOwner();
  const invite = await createInvite(body.parse(await req.json()).email);
  return { ...invite, url: `${(process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "")}/invite/${invite.id}` };
});
