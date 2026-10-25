import { hasNumber } from "./format";
import type { Entry, Profile, Skill } from "./types";

/** A 0–100 score for how complete and convincing the master profile is. */
export function profileStrength(m: { profile: Profile; entries: Entry[]; skills: Skill[] }) {
  const achievements = m.entries.filter((e) => e.kind !== "education").flatMap((e) => e.achievements);
  const withNumbers = achievements.filter((a) => hasNumber(a.text)).length;
  let score = 0;
  if (m.profile.name) score += 5;
  if (m.profile.email) score += 5;
  if (m.entries.some((e) => e.kind === "experience")) score += 15;
  if (m.entries.some((e) => e.kind === "education")) score += 10;
  score += Math.min(achievements.length, 10) * 2.5;
  if (achievements.length) score += (withNumbers / achievements.length) * 25;
  score += Math.min(m.skills.length, 8) * 1.25;
  return Math.round(Math.min(score, 100));
}
