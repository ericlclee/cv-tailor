import type { NextRequest } from "next/server";
import { getMaster } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";
import { rateCv } from "@/lib/tailor";
import { getVersion, restoreVersion } from "@/lib/versions";

async function params(ctx: RouteContext<"/api/cvs/[id]/versions/[n]">) {
  const { id, n } = await ctx.params;
  const num = Number(n);
  if (!Number.isInteger(num) || num < 1) throw new HttpError(400, "Versions are numbered from 1");
  return { id, n: num };
}

// One version of a CV, rated like the current one, for looking back at it.
export const GET = handler(async (_req: NextRequest, ctx: RouteContext<"/api/cvs/[id]/versions/[n]">) => {
  const { id, n } = await params(ctx);
  const version = await getVersion(id, n);
  if (!version) throw new HttpError(404, `Version ${n} not found`);
  return { version, rating: rateCv(version.content, await getMaster()) };
});

// Bring the version back, as a new latest version.
export const POST = handler(async (_req: NextRequest, ctx: RouteContext<"/api/cvs/[id]/versions/[n]">) => {
  const { id, n } = await params(ctx);
  return restoreVersion(id, n);
});
