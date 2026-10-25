import type { NextRequest } from "next/server";
import { undoActivity } from "@/lib/activity";
import { handler } from "@/lib/http";

export const POST = handler(async (_req: NextRequest, ctx: RouteContext<"/api/activity/[id]/undo">) => {
  const { id } = await ctx.params;
  const { snapshots: _s, ...rest } = await undoActivity(id);
  void _s;
  return rest;
});
