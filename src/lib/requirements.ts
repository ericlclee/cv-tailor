import { hasNumber } from "./format";
import { containsTerm, normalize } from "./keywords";
import type { Entry, ParsedJob, Skill } from "./types";

// Links each job requirement to the achievements that prove it: the ones the chat
// linked when it curated the listing (it judges meaning, so "evals" is proven by an
// achievement about building evaluators), plus any whose words match the requirement,
// which also catches achievements added since. Shared by the match view and the chat.

export type ReqState = "proven" | "weak" | "gap" | "unclaimed";

export interface Requirement {
  name: string;
  weight: "Must" | "Nice";
  state: ReqState;
  note: string;
  proofs: { achievementId: string; text: string; role: string }[];
}

/** How a requirement is keyed in Job.evidence. */
export const requirementKey = (name: string) => normalize(name).trim();

function yearsOfExperience(entries: Entry[]) {
  let months = 0;
  const now = new Date();
  for (const e of entries.filter((x) => x.kind === "experience")) {
    const s = e.startDate.match(/^(\d{4})(?:-(\d{2}))?/);
    if (!s) continue;
    const start = new Date(Number(s[1]), Number(s[2] ?? 1) - 1);
    const em = e.endDate.match(/^(\d{4})(?:-(\d{2}))?/);
    const end = e.current || !em ? now : new Date(Number(em[1]), Number(em[2] ?? 12) - 1);
    months += Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());
  }
  return Math.floor(months / 12);
}

export function analyzeRequirements(job: ParsedJob, entries: Entry[], skills: Skill[], unclaimed: string[] = [], linked: Record<string, string[]> = {}): Requirement[] {
  const out: Requirement[] = [];
  const skipped = new Set(unclaimed.map((u) => normalize(u).trim()));
  const needYears = Number(job.yearsExperience.match(/\d+/)?.[0] ?? 0);
  if (needYears) {
    const have = yearsOfExperience(entries);
    out.push({
      name: `${job.yearsExperience} experience`,
      weight: "Must",
      state: have >= needYears ? "proven" : "gap",
      note: have ? `${have} years from your role dates` : "No dated roles yet",
      proofs: [],
    });
  }
  const seen = new Set<string>();
  const terms = [...job.mustHave.map((t) => [t, "Must"] as const), ...job.niceToHave.map((t) => [t, "Nice"] as const)];
  for (const [name, weight] of terms) {
    const key = requirementKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (skipped.has(key)) {
      out.push({ name, weight, state: "unclaimed", note: "Won't claim", proofs: [] });
      continue;
    }
    const chosen = new Set(linked[key] ?? []);
    const proofs = entries.flatMap((e) =>
      e.achievements
        .filter((a) => chosen.has(a.id) || containsTerm(normalize(`${a.text} ${a.skills.join(" ")}`), name))
        .map((a) => ({ achievementId: a.id, text: a.text, role: [e.title, e.organization].filter(Boolean).join(", ") })),
    );
    const listed = skills.some((s) => containsTerm(normalize(s.name), name));
    if (proofs.length) {
      const strong = proofs.some((p) => hasNumber(p.text));
      out.push({ name, weight, state: strong ? "proven" : "weak", note: strong ? `${proofs.length} proof${proofs.length > 1 ? "s" : ""}` : "Weak proof", proofs });
    } else if (listed) {
      out.push({ name, weight, state: "weak", note: "Listed skill, no example", proofs: [] });
    } else {
      out.push({ name, weight, state: "gap", note: "No proof yet", proofs: [] });
    }
  }
  return out;
}

export const backedCount = (reqs: Requirement[]) => reqs.filter((r) => r.state === "proven" || r.state === "weak").length;
