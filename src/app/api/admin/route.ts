import { approvals, users } from "@/lib/db";
import { handler } from "@/lib/http";
import { requireOwner } from "@/lib/users";

// Everyone with an account, and approved emails that haven't signed in yet (owner only).
export const GET = handler(async () => {
  const me = await requireOwner();
  const [all, approved] = await Promise.all([users.list(), approvals.list()]);
  return {
    me: me.id,
    users: all.map((u) => ({ id: u.id, email: u.email, name: u.name, picture: u.picture, role: u.role, createdAt: u.createdAt, lastSignInAt: u.lastSignInAt, connected: Boolean(u.mcpKeyHash) })),
    approved: approved.map((a) => ({ email: a.email, approvedAt: a.approvedAt })),
  };
});
