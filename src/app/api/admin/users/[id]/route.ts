import type { NextRequest } from "next/server";
import { users } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";
import { requireOwner } from "@/lib/users";

// Remove someone and everything they've stored (owner only; not yourself).
export const DELETE = handler(async (_req: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) => {
  const me = await requireOwner();
  const { id } = await ctx.params;
  if (id === me.id) throw new HttpError(400, "You can't remove yourself.");
  await users.remove(id);
});
