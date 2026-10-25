import { ApplicationView } from "@/components/workspace/application-view";
import { getApplication } from "@/lib/applications";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({ params }: PageProps<"/apps/[id]">) {
  const { id } = await params;
  const job = await getApplication(id);
  const role = job ? [job.parsed.title, job.parsed.company && `at ${job.parsed.company}`].filter(Boolean).join(" ") : "this job";
  const context = job ? job.parsed.company || job.parsed.title || "Application" : "Application";
  return <ApplicationView id={id} role={role} context={context} />;
}
