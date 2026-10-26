import { z } from "zod";
import { handler } from "@/lib/http";
import { approveEmail, requireOwner } from "@/lib/users";

const body = z.object({ email: z.string().trim().email("Enter a valid email address.") });

// Approve an email (owner only). That Google account can then sign in.
export const POST = handler(async (req: Request) => {
  await requireOwner();
  return approveEmail(body.parse(await req.json()).email);
});
