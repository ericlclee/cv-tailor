import type { Ambition, CvRating } from "./ambition";
import type { CvDraft } from "./types";

// What the in-chat CV view (the MCP App in src/mcp-app) receives: the CV as it
// reads on the page, with every line's ambition rating.

export interface CvViewData {
  applicationId: string;
  /** e.g. "Senior Data Analyst at Acme" */
  role: string;
  ambition: Ambition;
  /** The level the CV was written at, when known. */
  writtenAt: Ambition | null;
  cv: {
    name: string;
    headline: string;
    contact: string[];
    summary: { text: string; level: Ambition };
    skills: { category: string; items: { name: string; level: Ambition }[] }[];
    sections: { title: string; items: { heading: string; subheading: string; dates: string; bullets: { id: string; text: string; level: Ambition; warning?: string }[] }[] }[];
  } | null;
  links: { app: string; pdf?: string; docx?: string };
}

export function toCvViewData(input: { applicationId: string; role: string; ambition: Ambition; cv: CvDraft | null; rating: CvRating | null; appUrl: string }): CvViewData {
  const { cv, rating } = input;
  const base = `${input.appUrl}/apps/${input.applicationId}?tab=cv`;
  if (!cv || !rating) return { applicationId: input.applicationId, role: input.role, ambition: input.ambition, writtenAt: null, cv: null, links: { app: base } };
  const c = cv.content;
  const h = c.header;
  return {
    applicationId: input.applicationId,
    role: input.role,
    ambition: input.ambition,
    writtenAt: cv.ambition ?? null,
    cv: {
      name: h.name,
      headline: h.headline,
      contact: [h.email, h.phone, h.location, ...h.links.map((l) => l.url.replace(/^https?:\/\/(www\.)?/, ""))].filter(Boolean),
      summary: { text: c.summary, level: rating.summary },
      skills: c.skills.map((g) => ({ category: g.category, items: g.items.map((name) => ({ name, level: rating.skills[name] ?? 0 })) })),
      sections: c.sections
        .filter((s) => s.include && s.items.some((i) => i.include))
        .map((s) => ({
          title: s.title,
          items: s.items
            .filter((i) => i.include)
            .map((i) => ({
              heading: i.title,
              subheading: i.organization,
              dates: i.dates,
              bullets: i.bullets.filter((b) => b.include).map((b) => ({ id: b.id, text: b.text, level: rating.bullets[b.id] ?? 0, ...(b.warning ? { warning: b.warning } : {}) })),
            })),
        })),
    },
    links: { app: base, pdf: `${input.appUrl}/api/cvs/${cv.id}/export?format=pdf`, docx: `${input.appUrl}/api/cvs/${cv.id}/export?format=docx` },
  };
}
