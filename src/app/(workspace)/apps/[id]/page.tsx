import { ActivityPanel } from "@/components/workspace/activity-panel";
import { ApplicationDocument } from "@/components/workspace/application-doc";
import { getApplication } from "@/lib/applications";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({ params, searchParams }: PageProps<"/apps/[id]">) {
  const { id } = await params;
  const { tab } = await searchParams;
  const job = await getApplication(id);
  const role = job ? [job.parsed.title, job.parsed.company && `at ${job.parsed.company}`].filter(Boolean).join(" ") : "this job";
  const view = tab === "cv" ? "cv" : tab === "timeline" ? "timeline" : "match";
  const prompts =
    view === "cv"
      ? [`Review my CV Tailor CV for ${role} and suggest improvements.`, `Make my ${role} CV shorter.`]
      : view === "timeline"
        ? [`I applied for ${role} today. Update CV Tailor.`, `Help me prepare for my ${role} interview using my CV Tailor profile.`]
        : [`Go through the gaps for ${role} in CV Tailor with me.`, `Draft my CV for ${role} in CV Tailor.`];
  return (
    <>
      <ApplicationDocument id={id} tab={view} role={role} />
      <ActivityPanel key={id} scope={id} context={job ? job.parsed.company || job.parsed.title || "Application" : "Application"} prompts={prompts} />
    </>
  );
}
