import type { NextRequest } from "next/server";
import { get, put, remove } from "@/lib/db";
import { toEntry } from "@/lib/entries";
import { handler, HttpError } from "@/lib/http";

export const PUT = handler(async (req: NextRequest, ctx: RouteContext<"/api/entries/[id]">) => {
  const { id } = await ctx.params;
  const existing = await get("entries", id);
  if (!existing) throw new HttpError(404, "Entry not found");
  return put("entries", toEntry(await req.json(), existing));
});

export const DELETE = handler(async (_req: NextRequest, ctx: RouteContext<"/api/entries/[id]">) => {
  const { id } = await ctx.params;
  await remove("entries", id);
});
