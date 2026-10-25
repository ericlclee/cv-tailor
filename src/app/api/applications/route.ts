import { z } from "zod";
import { tracker } from "@/lib/activity";
import { createApplication, listApplications } from "@/lib/applications";
import { getMaster } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";
import { fetchJob } from "@/lib/jobs";
import { profileStrength } from "@/lib/strength";

// Everything the sidebar needs.
export const GET = handler(async () => {
  const [m, apps] = await Promise.all([getMaster(), listApplications()]);
  return { profile: { name: m.profile.name, strength: profileStrength(m), started: m.entries.length > 0 }, apps };
});

const body = z.object({ url: z.string().default(""), description: z.string().default("") });

// Start an application from the web app (the chat uses the create_application tool).
export const POST = handler(async (req: Request) => {
  const b = body.parse(await req.json());
  if (!b.url.trim() && b.description.trim().length < 100) throw new HttpError(400, "Paste a job link or the full description.");
  const input = b.description.trim() ? { text: b.description, url: b.url, source: "Pasted" } : await fetchJob(b.url).then((f) => ({ text: f.text, url: b.url, source: f.source, hints: f.hints }));
  const job = await createApplication(input);
  const t = tracker();
  await t.doc("jobs", job.id);
  await t.record({ source: "web", kind: "application", summary: `Started an application: ${[job.parsed?.title, job.parsed?.company].filter(Boolean).join(" at ") || "new job"}`, appId: job.id });
  return { id: job.id };
});
