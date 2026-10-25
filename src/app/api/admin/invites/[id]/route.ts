import type { NextRequest } from "next/server";
import { invites } from "@/lib/db";
import { handler } from "@/lib/http";
import { requireOwner } from "@/lib/users";

// Withdraw an invite (owner only).
export const DELETE = handler(async (_req: NextRequest, ctx: RouteContext<"/api/admin/invites/[id]">) => {
  await requireOwner();
  await invites.remove((await ctx.params).id);
});
