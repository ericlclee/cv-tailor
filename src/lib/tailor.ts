import "server-only";
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
  sectionOrder: EntryKind[];
  skills: { category: string; items: string[] }[];
  entries: { entryId: string; include: boolean; bullets: { text: string; sourceIds: string[] }[] }[];
}

/**
 * Turn a plan into CV content. Titles, employers and dates always come from the
 * profile; bullets keep links to their source achievements; skills the profile
 * doesn't show are dropped; numbers missing from the sources are flagged.
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
      return { id: newId(), text: b.text, sourceIds, include: true, warning: sourceIds.length ? undefined : "Not linked to anything in your profile. Check it's accurate." };
    });
    return { include: p.include, bullets: [...bullets, ...unusedBullets(e, used)] };
  });

  const known = new Set(m.skills.map((s) => normalize(s.name).trim()));
  const evidence = normalize(m.entries.flatMap((e) => e.achievements.flatMap((a) => [a.text, ...a.skills])).join(" "));
  const removedSkills: string[] = [];
  const skills = out.skills
    .map((g) => ({
      category: g.category,
      items: g.items.filter((i) => {
        const ok = known.has(normalize(i).trim()) || evidence.includes(normalize(i));
        if (!ok) removedSkills.push(i);
        return ok;
      }),
    }))
    .filter((g) => g.items.length);

  const content: CvContent = { header: header(m, out.headline), summary: out.summary, skills, sections };
  flagNumbers(content, achievements);
  return { content, achievements, removedSkills };
}

/** Flag included bullets whose numbers don't appear in their sources. */
export function flagNumbers(content: CvContent, achievements: Map<string, { text: string }>) {
  for (const s of content.sections)
    for (const i of s.items)
      for (const b of i.bullets) {
        if (!b.include || !b.sourceIds.length) continue;
        const nums = unsupportedNumbers(b.text, b.sourceIds.map((id) => achievements.get(id)?.text ?? ""));
        if (nums.length) b.warning = `Contains ${nums.join(", ")}, which isn't in your profile. Check it's accurate.`;
      }
}
