import "server-only";
import { getMaster, list, put, remove, type Master } from "./db";
import { hasNumber } from "./format";
import { containsTerm, normalize } from "./keywords";
import type { Entry, Suggestion } from "./types";

// The profile coach: questions that would make the master profile stronger.

const now = () => new Date().toISOString();

function suggestion(id: string, s: Omit<Suggestion, "id" | "status" | "createdAt" | "jobId"> & { jobId?: string | null }): Suggestion {
  return { id, status: "open", createdAt: now(), jobId: null, ...s };
}

const describe = (e: Entry) => [e.title, e.organization].filter(Boolean).join(" at ") || "this entry";

/** Deterministic checks. Ids are stable so a dismissed question doesn't come back. */
export function ruleSuggestions(m: Master): Suggestion[] {
  const out: Suggestion[] = [];
  const work = m.entries.filter((e) => e.kind === "experience");
  if (!work.length) {
    out.push(
      suggestion("rule:no-experience", {
        kind: "missing-section",
        question: "What jobs, internships or part-time roles have you had? Include the title, company, dates and what you did.",
        reason: "Your profile has no work experience yet. Even short or unrelated jobs show reliability and transferable skills.",
        entryId: null,
        achievementId: null,
      }),
    );
  }
  if (!m.entries.some((e) => e.kind === "education")) {
    out.push(
      suggestion("rule:no-education", {
        kind: "missing-section",
        question: "Where did you study, what qualification did you get, and when?",
        reason: "Many applicant tracking systems filter on education, so it helps to have it on record.",
        entryId: null,
        achievementId: null,
      }),
    );
  }
  if (!m.entries.some((e) => e.kind === "project") && work.length < 3) {
    out.push(
      suggestion("rule:no-projects", {
        kind: "missing-section",
        question: "Have you built or led anything outside your main job, such as side projects, open source, a course project, a club or a freelance piece?",
        reason: "Projects are a strong way to show skills your job titles don't.",
        entryId: null,
        achievementId: null,
      }),
    );
  }
  for (const e of m.entries) {
    if (["experience", "project", "volunteer"].includes(e.kind) && e.achievements.length < 2) {
      out.push(
        suggestion(`rule:thin:${e.id}`, {
          kind: "thin-entry",
          question: `Tell me more about ${describe(e)}. What were you responsible for, what did you change or improve, and what was the result?`,
          reason: `This entry has ${e.achievements.length ? "only one bullet" : "no bullets"}. Aim for 3–5 achievements per role.`,
          entryId: e.id,
          achievementId: null,
        }),
      );
    }
    if (e.kind === "education") continue;
    for (const a of e.achievements) {
      if (!hasNumber(a.text)) {
        out.push(
          suggestion(`rule:metric:${a.id}`, {
            kind: "missing-metric",
            question: `Can you put a number on this? "${a.text}"`,
            reason: `${describe(e)}. Numbers (%, time saved, revenue, users, team size, volume) make an achievement far more convincing. Rough estimates are fine.`,
            entryId: e.id,
            achievementId: a.id,
          }),
        );
      }
    }
  }
  const evidence = normalize(m.entries.flatMap((e) => e.achievements.flatMap((a) => [a.text, ...a.skills])).join(" "));
  for (const s of m.skills) {
    if (!containsTerm(evidence, s.name)) {
      out.push(
        suggestion(`rule:skill:${normalize(s.name).trim()}`, {
          kind: "skill-evidence",
          question: `Where have you used ${s.name}? Describe something you did with it.`,
          reason: "This skill is listed but no achievement shows it. Recruiters trust skills backed by examples.",
          entryId: null,
          achievementId: null,
        }),
      );
    }
  }
  if (!m.profile.name || !m.profile.email) {
    out.push(
      suggestion("rule:contact", {
        kind: "missing-section",
        question: "What name, email, phone and location should appear at the top of your CV?",
        reason: "Your contact details are incomplete.",
        entryId: null,
        achievementId: null,
      }),
    );
  }
  return out;
}

/** Sync rule-based questions into the store: add new ones, drop ones that no longer apply. */
export async function refreshSuggestions() {
  const m = await getMaster();
  const rules = ruleSuggestions(m);
  const ruleIds = new Set(rules.map((r) => r.id));
  const existing = await list("suggestions");
  const existingIds = new Set(existing.map((s) => s.id));
  await Promise.all([
    ...existing.filter((s) => s.id.startsWith("rule:") && s.status === "open" && !ruleIds.has(s.id)).map((s) => remove("suggestions", s.id)),
    ...rules.filter((r) => !existingIds.has(r.id)).map((r) => put("suggestions", r)),
  ]);
  return openSuggestions();
}

const ORDER: Suggestion["kind"][] = ["missing-section", "job-gap", "thin-entry", "interview", "skill-evidence", "missing-metric"];
export async function openSuggestions() {
  return (await list("suggestions"))
    .filter((s) => s.status === "open")
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || b.createdAt.localeCompare(a.createdAt));
}

export function masterForPrompt(m: Master) {
  return JSON.stringify(
    {
      profile: { headline: m.profile.headline, summary: m.profile.summary, location: m.profile.location },
      skills: m.skills.map((s) => s.name),
      entries: m.entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        title: e.title,
        organization: e.organization,
        dates: [e.startDate, e.current ? "present" : e.endDate].filter(Boolean).join(" to "),
        description: e.description || undefined,
        achievements: e.achievements.map((a) => ({ id: a.id, text: a.text, skills: a.skills })),
      })),
    },
    null,
    1,
  );
}
