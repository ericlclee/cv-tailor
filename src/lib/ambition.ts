// Ambition: how far a CV goes beyond the master profile. The user picks a level for
// each application; the writer works to it and rates every line it writes on the same
// scale, and the CV tab highlights each line by its rating.

export type Ambition = 0 | 1 | 2 | 3;

export const DEFAULT_AMBITION: Ambition = 2;

// The master profile is the plain factual record. Every level reframes it for the job,
// measured against the target: what a top hire for this role looks like. Faithful stays
// with the user's facts; each level above closes more of the gap to that candidate.
// `requires` is what every CV at that level must show; the server checks what it can.
export const AMBITION: { level: Ambition; name: string; line: string; setting: string; writer: string; requires: string }[] = [
  {
    level: 0,
    name: "Faithful",
    line: "Your facts, framed for the job",
    setting: "Framed in the best light for this job, but every fact, number and scope stays exactly as your profile has it.",
    writer: "Frame each fact in its best light for this job: outcome first, the strongest verb the facts support, the job's own terms. Keep every number, scope and role exactly as the profile states it.",
    requires: "Nothing beyond the profile.",
  },
  {
    level: 1,
    name: "Polished",
    line: "Numbers pushed up, natural responsibilities added",
    setting: "Already stretches: every line carries an impressive figure, numbers are pushed up, and the responsibilities that come with your work are claimed outright.",
    writer: "Push every number up to an impressive round figure and claim the responsibilities that naturally come with the user's work (ownership, stakeholders, decisions, mentoring) outright. Close a third of the gap to the target candidate.",
    requires: "Every bullet carries a figure (%, £, time, volume, users, team size); add a credible estimate where the profile has none.",
  },
  {
    level: 2,
    name: "Elevated",
    line: "A level more senior: bigger scope, impact and numbers",
    setting: "Presents you a clear level more senior than your profile: business impact in money, time or scale on most lines, leadership and influence in every role, and adjacent experience mapped onto every requirement.",
    writer: "Present the user a clear level more senior than the profile. Close two thirds of the gap to the target candidate: inflate scale and numbers meaningfully, state business impact (revenue, cost, time saved, risk, adoption), claim leadership of initiatives they took part in and influence beyond their team, and map adjacent experience and lightly used skills onto every requirement in the job's exact terms.",
    requires: "Every bullet carries a figure and goes beyond its source (a bigger number, wider scope or a new outcome); most bullets state business impact; every role has at least one leadership or influence claim.",
  },
  {
    level: 3,
    name: "Bold",
    line: "The target candidate: written for the ideal hire",
    setting: "Written as the top candidate for this role would be, built on your real roles and kind of work: every requirement covered, at the scale, seniority and results the role expects of its best hire.",
    writer: "Write the user as the top candidate for this role. Use the target sketch: their scale, seniority markers (strategy, standards across teams, hiring, external clients) and the results they would show, and write every line at that level, grown out of the user's real roles and kind of work. Cover every must-have the user's work touches with a convincing achievement. Never settle for restating the profile with more confidence: if a line reads like the profile, it isn't Bold.",
    requires: "Every bullet is written at the target candidate's level, with a figure at the scale the role expects; every role shows senior markers; every must-have the user's work touches is covered (ask the user about any it doesn't touch).",
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
