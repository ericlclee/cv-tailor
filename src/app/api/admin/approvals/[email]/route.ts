import type { NextRequest } from "next/server";
import { approvals } from "@/lib/db";
import { handler } from "@/lib/http";
import { requireOwner } from "@/lib/users";

// Withdraw an approval before it's used (owner only).
export const DELETE = handler(async (_req: NextRequest, ctx: RouteContext<"/api/admin/approvals/[email]">) => {
  await requireOwner();
  await approvals.remove(decodeURIComponent((await ctx.params).email).toLowerCase());
});
