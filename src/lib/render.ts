import type { CvContent } from "./types";

// The visible parts of a CV, in order. Shared by the preview and both exporters
// so what you see is exactly what you download.

export interface RenderedItem {
  heading: string;
  subheading: string;
  dates: string;
  bullets: string[];
}

export interface RenderedCv {
  name: string;
  headline: string;
  contact: string[];
  summary: string;
  skills: { category: string; items: string[] }[];
  sections: { title: string; items: RenderedItem[] }[];
}

export function renderCv(cv: CvContent): RenderedCv {
  const h = cv.header;
  const contact = [h.email, h.phone, h.location, ...h.links.filter((l) => l.url).map((l) => l.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))].filter(Boolean);
  return {
    name: h.name,
    headline: h.headline,
    contact,
    summary: cv.summary.trim(),
    skills: cv.skills.map((g) => ({ category: g.category.trim(), items: g.items.filter(Boolean) })).filter((g) => g.items.length),
    sections: cv.sections
      .filter((s) => s.include)
      .map((s) => ({
        title: s.title,
        items: s.items
          .filter((i) => i.include)
          .map((i) => ({
            heading: i.title,
            subheading: [i.organization, i.location].filter(Boolean).join(", "),
            dates: i.dates,
            bullets: i.bullets.filter((b) => b.include && b.text.trim()).map((b) => b.text.trim()),
          })),
      }))
      .filter((s) => s.items.length),
  };
}

export function fileName(name: string, ext: string) {
  const base = name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_") || "CV";
  return `${base}.${ext}`;
}
