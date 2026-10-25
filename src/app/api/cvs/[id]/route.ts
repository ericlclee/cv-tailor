import type { NextRequest } from "next/server";
import { z } from "zod";
import { cvContentSchema } from "@/lib/cv-schema";
import { get, put, remove } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";

export const GET = handler(async (_req: NextRequest, ctx: RouteContext<"/api/cvs/[id]">) => {
  const { id } = await ctx.params;
  const cv = await get("cvs", id);
  if (!cv) throw new HttpError(404, "CV not found");
  return { cv, job: cv.jobId ? await get("jobs", cv.jobId) : null };
});

const body = z.object({ name: z.string(), content: cvContentSchema });

export const PUT = handler(async (req: NextRequest, ctx: RouteContext<"/api/cvs/[id]">) => {
  const { id } = await ctx.params;
  const cv = await get("cvs", id);
  if (!cv) throw new HttpError(404, "CV not found");
  const b = body.parse(await req.json());
  return put("cvs", { ...cv, ...b, updatedAt: new Date().toISOString() });
});

export const DELETE = handler(async (_req: NextRequest, ctx: RouteContext<"/api/cvs/[id]">) => {
  const { id } = await ctx.params;
  await remove("cvs", id);
});
