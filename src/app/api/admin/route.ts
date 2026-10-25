import { invites, users } from "@/lib/db";
import { handler } from "@/lib/http";
import { requireOwner } from "@/lib/users";

// Everyone with an account, and the invites that haven't been used yet (owner only).
export const GET = handler(async () => {
  const me = await requireOwner();
  const now = new Date().toISOString();
  const [all, pending] = await Promise.all([users.list(), invites.list()]);
  return {
    me: me.id,
    users: all.map((u) => ({ id: u.id, email: u.email, name: u.name, picture: u.picture, role: u.role, createdAt: u.createdAt, lastSignInAt: u.lastSignInAt, connected: Boolean(u.mcpKeyHash) })),
    invites: pending.filter((i) => !i.usedBy && i.expiresAt > now).map((i) => ({ id: i.id, email: i.email, createdAt: i.createdAt, expiresAt: i.expiresAt })),
  };
});
