import "server-only";
import { toAmbition, type Ambition, type CvRating } from "./ambition";
import { newId, type Master } from "./db";
import { formatRange } from "./format";
import { normalize } from "./keywords";
import { ENTRY_KINDS, type CvBullet, type CvContent, type CvSection, type Entry, type EntryKind } from "./types";

// Turning a CV plan (written by the user's chat model) into CV content, and
// checking every bullet against the achievements it claims to be based on.

const KIND_TITLES = Object.fromEntries(ENTRY_KINDS.map((k) => [k.kind, k.plural])) as Record<EntryKind, string>;
const DEFAULT_ORDER: EntryKind[] = ["experience", "project", "education", "volunteer", "certification", "award", "publication"];

function itemFor(e: Entry, include: boolean, bullets: CvBullet[]) {
  return {
    id: newId(),
    sourceEntryId: e.id,
    title: e.title,
    organization: e.organization,
    location: e.location,
    dates: formatRange(e.startDate, e.endDate, e.current),
    include,
    bullets,
  };
}

/** Bullets the AI didn't use are kept (switched off) so the user can add them back. */
function unusedBullets(e: Entry, used: Set<string>): CvBullet[] {
  return e.achievements.filter((a) => !used.has(a.id)).map((a) => ({ id: newId(), text: a.text, sourceIds: [a.id], include: false }));
}

function assemble(m: Master, order: EntryKind[], pick: (e: Entry) => { include: boolean; bullets: CvBullet[] }): CvSection[] {
  const kinds = [...new Set([...order, ...DEFAULT_ORDER])];
  return kinds
    .map((kind) => {
      const items = m.entries.filter((e) => e.kind === kind).map((e) => {
        const p = pick(e);
        return itemFor(e, p.include, p.bullets);
      });
      return { id: newId(), kind, title: KIND_TITLES[kind], include: items.some((i) => i.include), items };
    })
    .filter((s) => s.items.length);
}

function header(m: Master, headline?: string): CvContent["header"] {
  const { summary: _s, ...rest } = m.profile;
  void _s;
  return { ...rest, headline: headline || m.profile.headline };
}

/** Numbers in a bullet that don't appear in any of its sources: a cheap, deterministic fact check. */
export function unsupportedNumbers(text: string, sources: string[]) {
  const src = sources.join(" ").replace(/,/g, "");
  return (text.replace(/,/g, "").match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => !src.includes(n));
}

/** What a writer (Claude here, or the user's own chat via MCP) decides: which evidence goes where, reworded. */
export interface CvPlan {
  headline: string;
  summary: string;
  summaryAmbition?: number;
  sectionOrder: EntryKind[];
  skills: { category: string; items: string[] }[];
  entries: { entryId: string; include: boolean; bullets: { text: string; sourceIds: string[]; ambition?: number }[] }[];
}

/**
 * Turn a plan into CV content. Titles, employers and dates always come from the
 * profile; bullets keep links to their source achievements and the writer's rating;
 * numbers missing from the sources are flagged.
 */
export function buildCvFromPlan(m: Master, out: CvPlan) {
  const achievements = new Map(m.entries.flatMap((e) => e.achievements.map((a) => [a.id, a])));
  const plan = new Map(out.entries.map((p) => [p.entryId, p]));
  const sections = assemble(m, out.sectionOrder, (e) => {
    const p = plan.get(e.id);
    if (!p) {
      const keep = ["education", "certification"].includes(e.kind);
      return { include: keep, bullets: unusedBullets(e, new Set()).map((b) => ({ ...b, include: keep })) };
    }
    const used = new Set<string>();
    const bullets: CvBullet[] = p.bullets.map((b) => {
      const sourceIds = b.sourceIds.filter((id) => achievements.has(id));
      sourceIds.forEach((id) => used.add(id));
      return { id: newId(), text: b.text, sourceIds, include: true, ambition: toAmbition(b.ambition, 0), warning: sourceIds.length ? undefined : UNLINKED_WARNING };
    });
    return { include: p.include, bullets: [...bullets, ...unusedBullets(e, used)] };
  });

  const known = new Set(m.skills.map((s) => normalize(s.name).trim()));
  const evidence = normalize(m.entries.flatMap((e) => e.achievements.flatMap((a) => [a.text, ...a.skills])).join(" "));
  // Skills the profile doesn't show stay on the CV; they're reported so the user can prepare for them.
  const unbackedSkills = out.skills.flatMap((g) => g.items).filter((i) => !known.has(normalize(i).trim()) && !evidence.includes(normalize(i)));
  const skills = out.skills.filter((g) => g.items.length);

  const content: CvContent = { header: header(m, out.headline), summary: out.summary, summaryAmbition: toAmbition(out.summaryAmbition, 0), skills, sections };
  flagNumbers(content, achievements);
  return { content, achievements, unbackedSkills };
}

/**
 * Rate every line of a CV. The writer's own rating is the starting point, raised to what
 * the checks can see: a line with no source is Bold, and a number the sources don't
 * contain makes a line at least Elevated. Skills no achievement shows are Bold.
 */
export function rateCv(content: CvContent, m: Master): CvRating {
  const achievements = new Map(m.entries.flatMap((e) => e.achievements.map((a) => [a.id, a.text] as const)));
  const allText = [...achievements.values()];
  const raise = (declared: Ambition | undefined, floor: Ambition) => Math.max(declared ?? 0, floor) as Ambition;
  const bullets: CvRating["bullets"] = {};
  for (const s of content.sections)
    for (const i of s.items)
      for (const b of i.bullets) {
        const floor = !b.sourceIds.length ? 3 : unsupportedNumbers(b.text, b.sourceIds.map((id) => achievements.get(id) ?? "")).length ? 2 : 0;
        bullets[b.id] = raise(b.ambition, floor);
      }
  const summary = raise(content.summaryAmbition, unsupportedNumbers(content.summary, allText).length ? 2 : 0);
  const known = new Set(m.skills.map((s) => normalize(s.name).trim()));
  const evidence = normalize(m.entries.flatMap((e) => e.achievements.flatMap((a) => [a.text, ...a.skills])).join(" "));
  const skills: CvRating["skills"] = {};
  for (const item of content.skills.flatMap((g) => g.items)) if (!known.has(normalize(item).trim()) && !evidence.includes(normalize(item))) skills[item] = 3;
  return { bullets, summary, skills };
}

const words = (t: string) => normalize(t).split(/\s+/).filter((w) => w.length > 2);

/**
 * Bullets that read as a copy of the profile rather than a rewrite for the job: nearly
 * all their words come from one source and they're about as long as it.
 */
export function nearCopies(content: CvContent, m: Master) {
  const achievements = new Map(m.entries.flatMap((e) => e.achievements.map((a) => [a.id, a.text] as const)));
  const out: { bulletId: string; text: string }[] = [];
  for (const s of content.sections)
    for (const i of s.items)
      for (const b of i.bullets) {
        if (!b.include || b.sourceIds.length !== 1) continue;
        const src = achievements.get(b.sourceIds[0]);
        if (!src) continue;
        const bw = words(b.text);
        const sw = new Set(words(src));
        const shared = bw.filter((w) => sw.has(w)).length / Math.max(bw.length, 1);
        const ratio = bw.length / Math.max(sw.size, 1);
        if (shared >= 0.8 && ratio > 0.7) out.push({ bulletId: b.id, text: b.text });
      }
  return out;
}

export const UNLINKED_WARNING = "Not linked to your profile. Be ready to back this up in an interview.";

/** Flag included bullets whose numbers don't appear in their sources. */
export function flagNumbers(content: CvContent, achievements: Map<string, { text: string }>) {
  for (const s of content.sections)
    for (const i of s.items)
      for (const b of i.bullets) {
        if (!b.include || !b.sourceIds.length) continue;
        const nums = unsupportedNumbers(b.text, b.sourceIds.map((id) => achievements.get(id)?.text ?? ""));
        if (nums.length) b.warning = `Uses ${nums.join(", ")}, which isn't in your profile. Be ready to explain how you got it.`;
      }
}
