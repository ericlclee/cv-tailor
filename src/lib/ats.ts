import type { PageFit } from "./export";
import { containsTerm, cvPlainText, keywordReport, normalize } from "./keywords";
import type { CvContent, ParsedJob } from "./types";

// An estimate of how an applicant tracking system would score this CV against the
// listing. There is no single ATS standard, so this follows what the common ones do:
// parse the CV into sections, then match it to the job's terms and title. Our own
// export is always parseable (one column, real text, standard headings), so the score
// mostly moves with keyword coverage. Deterministic, so it only changes when the CV does.

export interface AtsCheck {
  label: string;
  /** What the check found, in a few words. */
  value: string;
  ok: boolean;
  /** Points earned out of `max`. */
  points: number;
  max: number;
}

export interface AtsReport {
  score: number;
  checks: AtsCheck[];
  /** Job terms the CV doesn't use, must-haves first. */
  missing: string[];
}

// Words that don't change which job a title is, so "Lead Data Analyst" matches "Data Analyst".
const SENIORITY = /\b(senior|sr|junior|jr|lead|principal|staff|head of|chief|associate|assistant|intern|graduate|i{1,3}|iv|[1-4])\b/g;

function titleMatch(content: CvContent, title: string) {
  const core = normalize(title).replace(SENIORITY, " ").replace(/\s+/g, " ").trim();
  if (!core) return true;
  const titles = normalize([content.header.headline, ...content.sections.flatMap((s) => (s.include ? s.items.filter((i) => i.include).map((i) => i.title) : []))].join("\n"));
  return containsTerm(titles, core);
}

export function atsReport(content: CvContent, job: ParsedJob, page: PageFit | null): AtsReport {
  const kw = keywordReport(cvPlainText(content), job);
  const total = kw.matched.length + kw.missing.length;
  const shown = (kind: string) => content.sections.some((s) => s.kind === kind && s.include && s.items.some((i) => i.include));
  const sections = [content.summary.trim() !== "", content.skills.some((g) => g.items.length), shown("experience"), shown("education")];
  const h = content.header;
  const contact = [h.name, h.email, h.phone].filter((x) => x.trim()).length;
  const title = titleMatch(content, job.title);

  const checks: AtsCheck[] = [
    // Keyword coverage is what ranks a CV in search, so it carries most of the score.
    { label: "Job keywords", value: total ? `${kw.matched.length} of ${total}` : "None in the listing", ok: kw.score >= 75, points: total ? Math.round(kw.score * 0.6) : 60, max: 60 },
    { label: "Job title", value: title ? "On the CV" : `“${job.title}” isn't on the CV`, ok: title, points: title ? 10 : 0, max: 10 },
    { label: "Standard sections", value: `${sections.filter(Boolean).length} of 4`, ok: sections.every(Boolean), points: Math.round(sections.filter(Boolean).length * 2.5), max: 10 },
    { label: "Contact details", value: contact === 3 ? "Complete" : "Missing name, email or phone", ok: contact === 3, points: Math.round((contact / 3) * 10), max: 10 },
    { label: "Length", value: !page ? "Unknown" : page.fits ? (page.tightened ? "One page, tight" : "One page") : "Over one page", ok: !!page?.fits, points: !page ? 10 : page.fits ? (page.tightened ? 8 : 10) : 0, max: 10 },
  ];
  return { score: checks.reduce((s, c) => s + c.points, 0), checks, missing: [...kw.mustHaveMissing, ...kw.missing.filter((m) => !kw.mustHaveMissing.includes(m))] };
}
