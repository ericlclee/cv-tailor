import { handler } from "@/lib/http";
import { accountsEnabled } from "@/lib/session";
import { currentUser } from "@/lib/users";

// Who's signed in, for the sidebar and the connection instructions.
export const GET = handler(async () => {
  if (!accountsEnabled()) return { accounts: false, user: null, canSignOut: false, mcpKeyCreatedAt: null };
  const u = await currentUser();
  return { accounts: true, user: { name: u.name, email: u.email, picture: u.picture, role: u.role }, canSignOut: true, mcpKeyCreatedAt: u.mcpKeyCreatedAt ?? null };
});
