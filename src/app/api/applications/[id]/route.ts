import type { NextRequest } from "next/server";
import { z } from "zod";
import { changeStatus, getApplication, saveJob } from "@/lib/applications";
import { get, getMaster, list, remove } from "@/lib/db";
import { pageFit } from "@/lib/export";
import { handler, HttpError } from "@/lib/http";
import { cvPlainText, keywordReport } from "@/lib/keywords";
import { renderCv } from "@/lib/render";
import { analyzeRequirements } from "@/lib/requirements";
import { rateCv } from "@/lib/tailor";

async function load(id: string) {
  const job = await getApplication(id);
  if (!job) throw new HttpError(404, "Application not found");
  const [m, cv] = await Promise.all([getMaster(), job.cvId ? get("cvs", job.cvId) : null]);
  return {
    job,
    requirements: analyzeRequirements(job.parsed, m.entries, m.skills, job.unclaimed, job.evidence),
    cv,
    report: cv ? keywordReport(cvPlainText(cv.content), job.parsed) : null,
    rating: cv ? rateCv(cv.content, m) : null,
    page: cv ? pageFit(renderCv(cv.content)) : null,
  };
}

export const GET = handler(async (_req: NextRequest, ctx: RouteContext<"/api/applications/[id]">) => load((await ctx.params).id));

const patch = z.object({
  notes: z.string().optional(),
  status: z.enum(["saved", "cv", "applied", "interview", "offer", "rejected", "withdrawn"]).optional(),
  ambition: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  /** Requirements the user doesn't have (the CV won't claim them). */
  notClaimed: z.object({ add: z.string().optional(), remove: z.string().optional() }).optional(),
});

export const PATCH = handler(async (req: NextRequest, ctx: RouteContext<"/api/applications/[id]">) => {
  const { id } = await ctx.params;
  const job = await getApplication(id);
  if (!job) throw new HttpError(404, "Application not found");
  const b = patch.parse(await req.json());
  if (b.notes !== undefined) job.notes = b.notes;
  if (b.ambition !== undefined) job.ambition = b.ambition;
  if (b.status && b.status !== job.status) changeStatus(job, b.status, "Updated in the web app.");
  if (b.notClaimed?.add && !job.unclaimed.some((u) => u.toLowerCase() === b.notClaimed!.add!.toLowerCase())) job.unclaimed.push(b.notClaimed.add);
  if (b.notClaimed?.remove) job.unclaimed = job.unclaimed.filter((u) => u.toLowerCase() !== b.notClaimed!.remove!.toLowerCase());
  await saveJob(job);
  return load(id);
});

export const DELETE = handler(async (_req: NextRequest, ctx: RouteContext<"/api/applications/[id]">) => {
  const { id } = await ctx.params;
  const job = await getApplication(id);
  if (job?.cvId) await remove("cvs", job.cvId);
  for (const a of await list("activity")) if (a.appId === id) await remove("activity", a.id);
  await remove("jobs", id);
});
