import "server-only";
import { DEFAULT_AMBITION } from "./ambition";
import { get, list, newId, put } from "./db";
import { parseJob, type FetchedJob } from "./jobs";
import { CLOSED_STATUSES, TRACK, type AppStatus, type Job, type TimelineEvent } from "./types";

// An application is a job plus where it's at: status, timeline, notes.

const now = () => new Date().toISOString();

export const STATUS_LABEL: Record<AppStatus, string> = {
  saved: "Matching",
  cv: "CV drafted",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Not progressed",
  withdrawn: "Withdrawn",
};

export const trackIndex = (s: AppStatus) => TRACK.findIndex((t) => t.status === s);

export async function createApplication(input: { text: string; url?: string; source?: string; hints?: FetchedJob["hints"] }): Promise<Job> {
  const parsed = await parseJob(input.text, input.hints ?? {});
  const at = now();
  const role = [parsed.title, parsed.company].filter(Boolean).join(", ");
  return put("jobs", {
    id: newId(),
    url: input.url ?? "",
    source: input.source ?? "Pasted",
    rawText: input.text,
    parsed,
    createdAt: at,
    updatedAt: at,
    status: "saved",
    reached: "saved",
    events: [{ id: newId(), at, title: "Saved", detail: `${role || "Job"} from ${input.url ? input.source : "a pasted description"}.` }],
    notes: "",
    unclaimed: [],
    cvId: null,
  });
}

export function saveJob(job: Job): Promise<Job> {
  return put("jobs", { ...job, updatedAt: now() });
}

export function addEvent(job: Job, e: Omit<TimelineEvent, "id">): TimelineEvent {
  const event = { id: newId(), ...e };
  job.events = [...(job.events ?? []), event].sort((a, b) => a.at.localeCompare(b.at));
  return event;
}

/** Move an application to a new status and log it. Returns the event so it can be undone. */
export function changeStatus(job: Job, to: AppStatus, detail = "", at = now()) {
  const from = job.status ?? "saved";
  job.status = to;
  if (!CLOSED_STATUSES.includes(to) && trackIndex(to) > trackIndex(job.reached ?? "saved")) job.reached = to;
  const titles: Record<AppStatus, string> = {
    saved: "Moved back to matching",
    cv: "CV drafted",
    applied: "Applied",
    interview: "Interview",
    offer: "Offer received",
    rejected: "Not progressed",
    withdrawn: "Withdrew",
  };
  const event = addEvent(job, { at, title: titles[to], detail });
  return { from, event };
}

export async function listApplications() {
  return (await list("jobs"))
    .filter((j) => j.parsed)
    .map((j) => {
      const events = j.events ?? [];
      const status = j.status ?? "saved";
      const upcoming = events.find((e) => e.at > now());
      return {
        id: j.id,
        title: j.parsed!.title || "Untitled role",
        company: j.parsed!.company,
        status,
        reached: j.reached ?? status,
        closed: CLOSED_STATUSES.includes(status),
        statusLabel: STATUS_LABEL[status],
        dateLabelAt: upcoming?.at ?? events.at(-1)?.at ?? j.createdAt,
        updatedAt: j.updatedAt ?? j.createdAt,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export type AppSummary = Awaited<ReturnType<typeof listApplications>>[number];

export async function getApplication(id: string) {
  const job = await get("jobs", id);
  if (!job?.parsed) return null;
  return { ...job, parsed: job.parsed, status: job.status ?? "saved", events: job.events ?? [], notes: job.notes ?? "", unclaimed: job.unclaimed ?? [], cvId: job.cvId ?? null, ambition: job.ambition ?? DEFAULT_AMBITION };
}
