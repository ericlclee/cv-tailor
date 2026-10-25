// Ambition: how far a CV goes beyond the master profile. The user picks a level for
// each application; the writer works to it and rates every line it writes on the same
// scale, and the CV tab highlights each line by its rating.

export type Ambition = 0 | 1 | 2 | 3;

export const DEFAULT_AMBITION: Ambition = 2;

// The master profile is the plain factual record. Every level reframes it for the job;
// the levels differ in how far past the facts the framing goes, up to Bold: the CV a
// model candidate for the role would have, built on the user's real background.
export const AMBITION: { level: Ambition; name: string; line: string; setting: string; writer: string }[] = [
  {
    level: 0,
    name: "Faithful",
    line: "Your facts, framed for the job",
    setting: "Framed in the best light for this job, but every fact, number and scope stays exactly as your profile has it.",
    writer: "Frame each fact in its best light for this job: outcome first, the strongest verb the facts support, the job's own terms. Keep every number, scope and role exactly as the profile states it.",
  },
  {
    level: 1,
    name: "Polished",
    line: "Numbers pushed up, natural responsibilities added",
    setting: "Already stretches: numbers pushed up to impressive round figures, and the responsibilities that naturally come with your work (ownership, stakeholders, process, mentoring) claimed outright.",
    writer: "Push numbers up to impressive round figures. Claim the responsibilities that naturally come with the user's work (ownership, stakeholder management, process, mentoring, decisions) even where the profile doesn't spell them out. Make every line sound accomplished.",
  },
  {
    level: 2,
    name: "Elevated",
    line: "A level more senior: bigger scope and numbers",
    setting: "Presents you a clear level more senior: bigger numbers, business-level scope and outcomes, leadership of initiatives you took part in, and adjacent experience and skills mapped onto every requirement.",
    writer: "Present the user a clear level more senior. Inflate numbers and scope meaningfully; claim team and business outcomes and leadership of initiatives they took part in; state impact the work plausibly had; map adjacent experience and lightly used skills onto every requirement the job lists, in its exact terms.",
  },
  {
    level: 3,
    name: "Bold",
    line: "Model candidate: written for the ideal hire",
    setting: "The CV a model candidate for this role would have, built on your real roles and the kind of work you do: every requirement covered with a convincing achievement, at the figures and responsibilities the role expects.",
    writer: "Write the CV of a model candidate for this role, built on the user's real roles and the kind of work they actually do. Cover every requirement with a convincing achievement; use the figures, scope and responsibilities the role expects of a strong hire; list every skill the job asks for that the user's work touches. Each line should still grow out of something the user did, so they can talk around it in an interview.",
  },
];

export const ambitionName = (l: Ambition) => AMBITION[l].name;

export function toAmbition(v: unknown, fallback: Ambition = DEFAULT_AMBITION): Ambition {
  const n = typeof v === "string" ? AMBITION.findIndex((a) => a.name.toLowerCase() === v.toLowerCase()) : Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? (n as Ambition) : fallback;
}

/** How each line of a CV is rated: the writer's own rating, raised to what the checks found. */
export interface CvRating {
  bullets: Record<string, Ambition>;
  summary: Ambition;
  /** Skills by name; only those above Faithful are listed. */
  skills: Record<string, Ambition>;
}
