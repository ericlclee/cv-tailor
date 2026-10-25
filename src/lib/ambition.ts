// Ambition: how far a CV goes beyond the master profile. The user picks a level for
// each application; the writer works to it and rates every line it writes on the same
// scale, and the CV tab highlights each line by its rating.

export type Ambition = 0 | 1 | 2 | 3;

export const DEFAULT_AMBITION: Ambition = 1;

export const AMBITION: { level: Ambition; name: string; line: string; setting: string; writer: string }[] = [
  {
    level: 0,
    name: "Faithful",
    line: "Says what your profile says",
    setting: "Your profile, reworded for this job. No new facts, numbers or scope.",
    writer: "Reword for clarity and the job's terms only. Keep every fact, number, scope and role exactly as the profile states it.",
  },
  {
    level: 1,
    name: "Polished",
    line: "Stronger wording, same facts",
    setting: "Confident, active wording and ownership verbs. The facts and numbers stay as they are.",
    writer: "Confident, active wording, with ownership verbs (Led, Owned, Built) for work the user drove. Keep the numbers as given, tidying rough estimates into clean figures.",
  },
  {
    level: 2,
    name: "Elevated",
    line: "Broader scope or ownership, rounded-up numbers",
    setting: "Claims ownership of team work you drove, frames scope and impact broadly, and rounds numbers in your favour.",
    writer: "Claim ownership of team work the user was central to. Frame scope and impact broadly: the system, client or business outcome the work fed into. Round numbers in the user's favour. Map adjacent experience onto the job's requirements, in its exact terms.",
  },
  {
    level: 3,
    name: "Bold",
    line: "A claim or figure beyond your profile",
    setting: "Everything in Elevated, plus stronger figures and outcomes you could argue in an interview, and skills you've only used lightly.",
    writer: "Everything in Elevated, plus stronger figures and outcomes the user could argue in an interview, and skills they've only used lightly. Propose any new number to the user and get their OK before saving it.",
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
