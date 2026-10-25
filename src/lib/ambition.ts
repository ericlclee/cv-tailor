// Ambition: how far a CV goes beyond the master profile. The user picks a level for
// each application; the writer works to it and rates every line it writes on the same
// scale, and the CV tab highlights each line by its rating.

export type Ambition = 0 | 1 | 2 | 3;

export const DEFAULT_AMBITION: Ambition = 2;

// The master profile is the plain factual record. Every level reframes it for the job;
// the levels differ in how far the framing may stretch the facts.
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
    line: "Ownership and impact framing, same facts",
    setting: "Claims the work you drove, leads with impact, and states scope at the level it mattered. Numbers stay as they are, tidied into clean figures.",
    writer: "Claim the work the user drove as theirs (Led, Owned, Built, Delivered), lead with the impact, and state scope at the level it mattered (team, product, client, business). Keep the numbers, tidied into clean figures.",
  },
  {
    level: 2,
    name: "Elevated",
    line: "Senior framing: broader scope, rounded-up numbers",
    setting: "Presents you a level more senior: ownership of team results you were central to, business-level scope and impact, numbers rounded up, adjacent experience mapped onto every requirement.",
    writer: "Present the user a level more senior. Claim ownership of team results they were central to; describe scope and impact at the business level; round numbers up generously; state the impact the profile clearly implies even where it isn't measured; map adjacent experience onto every requirement the job lists, in its exact terms.",
  },
  {
    level: 3,
    name: "Bold",
    line: "Claims or figures beyond your profile",
    setting: "Everything in Elevated, plus stronger figures, outcomes and scope you could argue in an interview, and skills you've used only lightly listed as working skills.",
    writer: "Everything in Elevated, plus stronger figures, outcomes and scope the user could argue in an interview, and skills they've used only lightly listed as working skills. Keep every figure plausible for the role and company size.",
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
