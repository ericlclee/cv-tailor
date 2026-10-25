import type { NextRequest } from "next/server";
import { get } from "@/lib/db";
import { toDocx, toPdf } from "@/lib/export";
import { handler, HttpError } from "@/lib/http";
import { fileName, renderCv } from "@/lib/render";

export const GET = handler(async (req: NextRequest, ctx: RouteContext<"/api/cvs/[id]/export">) => {
  const { id } = await ctx.params;
  const cv = await get("cvs", id);
  if (!cv) throw new HttpError(404, "CV not found");
  const format = req.nextUrl.searchParams.get("format") === "docx" ? "docx" : "pdf";
  const rendered = renderCv(cv.content);
  const name = fileName(`${rendered.name || "CV"} ${cv.name}`, format);
  const body = format === "pdf" ? await toPdf(rendered) : await toDocx(rendered);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
});
