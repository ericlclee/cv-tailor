import "server-only";
import { tracker } from "./activity";
import { get, put } from "./db";
import { HttpError } from "./http";
import type { ActivityDetail, CvContent, CvDraft, CvVersion } from "./types";

// Every change to a CV is kept as a numbered version (v1, v2…), so the user can look
// at any earlier state and bring it back. Going back adds a new version: nothing is lost.

const versionId = (cvId: string, n: number) => `${cvId}-v${n}`;

export const getVersion = (cvId: string, n: number) => get("versions", versionId(cvId, n));

/**
 * Save `cv` and record it as its next version. A CV from before versions existed
 * first gets `before` (its state until now) as v1, so that state isn't lost.
 */
export async function saveCv(cv: CvDraft, meta: { source: CvVersion["source"]; summary: string; restoredFrom?: number }, before: CvDraft | null): Promise<CvDraft> {
  let n = 1;
  if (before) {
    if (!before.version) await ensureVersion(before);
    n = (before.version ?? 1) + 1;
  }
  await put("versions", { id: versionId(cv.id, n), cvId: cv.id, n, at: cv.updatedAt, source: meta.source, summary: meta.summary, content: cv.content, ambition: cv.ambition, ...(meta.restoredFrom ? { restoredFrom: meta.restoredFrom } : {}) });
  return put("cvs", { ...cv, version: n });
}

/** Give a CV from before versions existed its first version. */
export async function ensureVersion(cv: CvDraft): Promise<CvDraft> {
  if (cv.version) return cv;
  await put("versions", { id: versionId(cv.id, 1), cvId: cv.id, n: 1, at: cv.updatedAt, source: "chat", summary: "Saved CV", content: cv.content, ambition: cv.ambition });
  return put("cvs", { ...cv, version: 1 });
}

/** What changed between two states of a CV, for the activity feed. */
export function contentChanges(a: CvContent, b: CvContent): ActivityDetail[] {
  const out: ActivityDetail[] = [];
  if (a.header.headline !== b.header.headline) out.push({ label: "Headline", before: a.header.headline, after: b.header.headline });
  if (a.summary !== b.summary) out.push({ label: "Summary", before: a.summary, after: b.summary });
  const lines = (c: CvContent) => new Map(c.sections.flatMap((s) => s.items.flatMap((i) => i.bullets.map((x) => [x.id, { text: x.text, shown: s.include && i.include && x.include }] as const))));
  const was = lines(a);
  const now = lines(b);
  for (const [id, line] of now) {
    const old = was.get(id);
    if ((!old || !old.shown) && line.shown) out.push({ label: "Added line", after: line.text });
    else if (old?.shown && !line.shown) out.push({ label: "Removed line", before: old.text });
    else if (old && line.shown && old.text !== line.text) out.push({ label: "Rewrote line", before: old.text, after: line.text });
  }
  for (const [id, old] of was) if (!now.has(id) && old.shown) out.push({ label: "Removed line", before: old.text });
  // Lines moved within a role: compare the order of the lines that are in both.
  const order = new Map(a.sections.flatMap((s) => s.items.map((i) => [i.id, i.bullets.filter((x) => x.include).map((x) => x.id)] as const)));
  for (const s of b.sections)
    for (const i of s.items) {
      const ids = i.bullets.filter((x) => x.include).map((x) => x.id);
      const after = ids.filter((id) => order.get(i.id)?.includes(id));
      const before = (order.get(i.id) ?? []).filter((id) => ids.includes(id));
      const k = after.findIndex((id, n) => id !== before[n]);
      if (k < 0) continue;
      // The moved line is the one whose removal makes both orders agree.
      const without = (list: string[], id: string) => list.filter((x) => x !== id).join();
      const moved = without(after, after[k]) === without(before, after[k]) ? after[k] : before[k];
      out.push({ label: "Moved line", after: now.get(moved)?.text });
    }
  return out;
}

/** An edit made in the web app. Unchanged content saves nothing. */
export async function editCv(cvId: string, change: { name: string; content: CvContent }) {
  const cv = await get("cvs", cvId);
  if (!cv) throw new HttpError(404, "CV not found");
  const details = contentChanges(cv.content, change.content);
  if (!details.length && change.name === cv.name) return cv;
  const t = tracker();
  await t.doc("cvs", cv.id);
  const ONE: Record<string, string> = { Summary: "Edited the summary", Headline: "Edited the headline", "Added line": "Added a line", "Removed line": "Removed a line", "Rewrote line": "Edited a line", "Moved line": "Moved a line" };
  const summary = details.length === 1 ? ONE[details[0].label] : details.length ? `Made ${details.length} changes` : "Renamed the CV";
  const saved = await saveCv({ ...cv, ...change, updatedAt: new Date().toISOString() }, { source: "web", summary }, cv);
  await t.record({ source: "web", kind: "cv", summary, appId: cv.jobId, details, cvVersion: saved.version });
  return saved;
}

/** Make version `n` the latest again, as a new version. */
export async function restoreVersion(cvId: string, n: number) {
  const cv = await get("cvs", cvId);
  if (!cv) throw new HttpError(404, "CV not found");
  const v = await getVersion(cvId, n);
  if (!v) throw new HttpError(404, `Version ${n} not found`);
  if (n === cv.version) return cv;
  const t = tracker();
  await t.doc("cvs", cv.id);
  const summary = `Went back to v${n}`;
  const saved = await saveCv({ ...cv, content: v.content, ambition: v.ambition ?? cv.ambition, updatedAt: new Date().toISOString() }, { source: "web", summary, restoredFrom: n }, cv);
  await t.record({ source: "web", kind: "cv", summary, appId: cv.jobId, details: contentChanges(cv.content, v.content), cvVersion: saved.version });
  return saved;
}
