import type { NextRequest } from "next/server";
import { z } from "zod";
import { cvContentSchema } from "@/lib/cv-schema";
import { get, remove } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";
import { editCv } from "@/lib/versions";

export const GET = handler(async (_req: NextRequest, ctx: RouteContext<"/api/cvs/[id]">) => {
  const { id } = await ctx.params;
  const cv = await get("cvs", id);
  if (!cv) throw new HttpError(404, "CV not found");
  return { cv, job: cv.jobId ? await get("jobs", cv.jobId) : null };
});

const body = z.object({ name: z.string(), content: cvContentSchema });

// Each edit saves a new version of the CV.
export const PUT = handler(async (req: NextRequest, ctx: RouteContext<"/api/cvs/[id]">) => {
  const { id } = await ctx.params;
  return editCv(id, body.parse(await req.json()));
});

export const DELETE = handler(async (_req: NextRequest, ctx: RouteContext<"/api/cvs/[id]">) => {
  const { id } = await ctx.params;
  await remove("cvs", id);
});
