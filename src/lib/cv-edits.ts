import { newId } from "./db";
import type { CvContent, CvEdit } from "./types";

/** Validate edits against a CV and fill in the text they replace. Unknown targets are dropped. */
export function prepareEdits(cv: CvContent, edits: CvEdit[]): CvEdit[] {
  const bullets = new Map(cv.sections.flatMap((s) => s.items.flatMap((i) => i.bullets.map((b) => [b.id, b]))));
  const items = new Set(cv.sections.flatMap((s) => s.items.map((i) => i.id)));
  return edits.flatMap((e): CvEdit[] => {
    if (e.op === "add") return e.itemId && items.has(e.itemId) && e.text?.trim() ? [{ ...e, text: e.text.trim() }] : [];
    const b = e.bulletId ? bullets.get(e.bulletId) : undefined;
    if (!b) return [];
    if (e.op === "replace" && !e.text?.trim()) return [];
    return [{ ...e, previous: b.text }];
  });
}

export function applyEdits(cv: CvContent, edits: CvEdit[]): CvContent {
  const next = structuredClone(cv);
  for (const e of edits) {
    for (const s of next.sections) {
      for (const it of s.items) {
        if (e.op === "add" && it.id === e.itemId) {
          it.bullets.push({ id: newId(), text: e.text!, sourceIds: [], include: true });
          it.include = true;
        }
        for (const b of it.bullets) {
          if (b.id !== e.bulletId) continue;
          if (e.op === "remove") b.include = false;
          if (e.op === "replace") {
            b.text = e.text!;
            b.include = true;
            b.warning = undefined;
          }
        }
      }
    }
  }
  return next;
}
