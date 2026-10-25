import "server-only";
import * as cheerio from "cheerio";
import { z } from "zod";
import { aiEnabled, aiJson } from "./ai";
import { HttpError } from "./http";
import { COMMON_SKILLS, containsTerm, normalize } from "./keywords";
import type { ParsedJob } from "./types";

// Getting a job description from a URL, and extracting what the job asks for.

export interface FetchedJob {
  source: string;
  text: string;
  hints: { title?: string; company?: string; location?: string };
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

async function getText(url: string, accept = "text/html,application/xhtml+xml") {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new HttpError(502, "Couldn't reach that page. Check the link, or paste the job description instead.");
  }
  if (!res.ok) {
    throw new HttpError(
      502,
      [401, 403, 429, 999].includes(res.status)
        ? "That job board blocks automated access. Open the listing, copy the description and paste it instead."
        : `The page returned an error (${res.status}). Paste the job description instead.`,
    );
  }
  return res.text();
}

export function htmlToText(html: string) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe").remove();
  $("br").replaceWith("\n");
  $("li").each((_, el) => {
    $(el).prepend("• ");
  });
  $("p, div, li, h1, h2, h3, h4, h5, h6, tr, section, ul, ol").each((_, el) => {
    $(el).append("\n");
  });
  return $.root()
    .text()
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

const decodeEntities = (s: string) => cheerio.load(`<div>${s}</div>`)("div").text();

/** Board-specific public APIs give much cleaner text than scraping the page. */
async function fromKnownBoard(u: URL): Promise<FetchedJob | null> {
  const parts = u.pathname.split("/").filter(Boolean);

  // Greenhouse: boards.greenhouse.io/{board}/jobs/{id} or job-boards.greenhouse.io/...
  if (/(^|\.)greenhouse\.io$/.test(u.hostname) && parts.includes("jobs")) {
    const board = parts[0];
    const id = parts[parts.indexOf("jobs") + 1];
    if (board && id) {
      const data = JSON.parse(await getText(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`, "application/json"));
      return {
        source: "Greenhouse",
        text: htmlToText(decodeEntities(data.content ?? "")),
        hints: { title: data.title, company: data.company_name ?? board, location: data.location?.name },
      };
    }
  }

  // Lever: jobs.lever.co/{company}/{id}
  if (u.hostname === "jobs.lever.co" && parts.length >= 2) {
    const data = JSON.parse(await getText(`https://api.lever.co/v0/postings/${parts[0]}/${parts[1]}`, "application/json"));
    const lists = (data.lists ?? []).map((l: { text: string; content: string }) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
    return {
      source: "Lever",
      text: [data.descriptionPlain, lists, data.additionalPlain].filter(Boolean).join("\n\n"),
      hints: { title: data.text, company: parts[0], location: data.categories?.location },
    };
  }

  // Ashby: jobs.ashbyhq.com/{org}/{id}
  if (u.hostname === "jobs.ashbyhq.com" && parts.length >= 2) {
    const data = JSON.parse(await getText(`https://api.ashbyhq.com/posting-api/job-board/${parts[0]}`, "application/json"));
    const job = (data.jobs ?? []).find((j: { id: string }) => j.id === parts[1]);
    if (job) {
      return {
        source: "Ashby",
        text: job.descriptionPlain || htmlToText(job.descriptionHtml ?? ""),
        hints: { title: job.title, company: parts[0], location: job.location },
      };
    }
  }
  // Workday: {tenant}.wd{n}.myworkdayjobs.com/[{locale}/]{site}/job/{location}/{slug}
  if (u.hostname.endsWith(".myworkdayjobs.com") && parts.includes("job")) {
    const tenant = u.hostname.split(".")[0];
    const jobAt = parts.indexOf("job");
    const site = parts[jobAt - 1];
    if (site) {
      const api = `https://${u.hostname}/wday/cxs/${tenant}/${site}/${parts.slice(jobAt).join("/")}`;
      const data = JSON.parse(await getText(api, "application/json"));
      const info = data.jobPostingInfo;
      if (info?.jobDescription) {
        return {
          source: "Workday",
          text: htmlToText(info.jobDescription),
          hints: { title: info.title, company: (data.hiringOrganization?.name ?? tenant).replace(/^\d+\s+/, ""), location: info.location },
        };
      }
    }
  }
  return null;
}

/** Many boards (LinkedIn, Indeed, Workday, company sites) embed schema.org JobPosting data. */
function fromJsonLd($: cheerio.CheerioAPI): FetchedJob | null {
  const blocks = $('script[type="application/ld+json"]').toArray();
  for (const b of blocks) {
    let data: unknown;
    try {
      data = JSON.parse($(b).text());
    } catch {
      continue;
    }
    const candidates = (Array.isArray(data) ? data : [data, ...((data as { "@graph"?: unknown[] })?.["@graph"] ?? [])]) as Record<string, unknown>[];
    const posting = candidates.find((d) => d && (d["@type"] === "JobPosting" || (Array.isArray(d["@type"]) && d["@type"].includes("JobPosting"))));
    if (posting?.description) {
      const org = posting.hiringOrganization as { name?: string } | undefined;
      const loc = (Array.isArray(posting.jobLocation) ? posting.jobLocation[0] : posting.jobLocation) as { address?: { addressLocality?: string; addressCountry?: string } } | undefined;
      return {
        source: "Job posting",
        text: htmlToText(decodeEntities(String(posting.description))),
        hints: {
          title: posting.title as string,
          company: org?.name,
          location: [loc?.address?.addressLocality, loc?.address?.addressCountry].filter(Boolean).join(", "),
        },
      };
    }
  }
  return null;
}

export async function fetchJob(rawUrl: string): Promise<FetchedJob> {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    throw new HttpError(400, "That doesn't look like a valid link.");
  }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, "Only http and https links are supported.");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|0\.0\.0\.0)/.test(u.hostname)) {
    throw new HttpError(400, "Local network addresses aren't allowed.");
  }

  const known = await fromKnownBoard(u).catch((e) => {
    if (e instanceof HttpError) throw e;
    return null;
  });
  if (known?.text) return tidy(known);

  const html = await getText(u.toString());
  const $ = cheerio.load(html);
  const ld = fromJsonLd($);
  if (ld && ld.text.length > 200) return tidy({ ...ld, source: hostLabel(u) });

  // Fall back to the page's main content.
  $("nav, header, footer, aside, form, [role=navigation], [aria-hidden=true]").remove();
  const main = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const text = htmlToText(main.html() ?? "");
  const looksBlocked = /sign in|log in|enable javascript|are you a robot|captcha|access denied/i.test(text.slice(0, 600));
  if (text.length < 400 || (looksBlocked && text.length < 2000)) {
    throw new HttpError(422, "Couldn't read the job description from that page (it may need a login or JavaScript). Paste the description instead.");
  }
  return { source: hostLabel(u), text: text.slice(0, 30000), hints: { title: $("h1").first().text().trim() || $("title").text().trim() } };
}

function tidy(f: FetchedJob): FetchedJob {
  const text = f.text
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const company = f.hints.company && f.hints.company === f.hints.company.toLowerCase() ? f.hints.company.replace(/(^|[-\s])\w/g, (c) => c.toUpperCase()) : f.hints.company;
  return { ...f, text, hints: { ...f.hints, company } };
}

function hostLabel(u: URL) {
  const h = u.hostname.replace(/^www\./, "");
  if (h.includes("linkedin.")) return "LinkedIn";
  if (h.includes("indeed.")) return "Indeed";
  if (h.includes("glassdoor.")) return "Glassdoor";
  if (h.includes("myworkdayjobs")) return "Workday";
  return h;
}

// ---------------------------------------------------------------------------

export const parsedJobSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  seniority: z.string().describe("e.g. Intern, Junior, Mid, Senior, Lead, Manager, Director; empty if unclear"),
  summary: z.string().describe("Two sentences on what the role is about"),
  mustHave: z.array(z.string()).describe("Required skills/qualifications as short ATS terms of 1-4 words, e.g. 'Python', 'B2B sales', 'stakeholder management'"),
  niceToHave: z.array(z.string()).describe("Preferred/bonus skills as short terms"),
  responsibilities: z.array(z.string()).describe("Main duties, one short sentence each"),
  keywords: z.array(z.string()).describe("Other important terms an ATS would scan for: tools, methods, domain words, certifications. Short terms, using the job's exact spelling"),
  yearsExperience: z.string().describe("e.g. '5+ years'; empty if not stated"),
  education: z.string().describe("Required education; empty if not stated"),
});

const JOB_SYSTEM = `You extract structured requirements from job descriptions for CV tailoring and ATS keyword matching.

- Use the job's exact spelling for terms (if it says "CI/CD" don't write "continuous integration").
- mustHave: things stated as required. niceToHave: things stated as preferred, a plus or a bonus. When the job doesn't distinguish, treat its core qualifications as mustHave.
- Keep terms short (1-4 words) so they can be matched in a CV. Split compound requirements ("Python or Go" -> "Python", "Go").
- keywords: 10-25 additional terms that matter for this role and aren't already in mustHave or niceToHave. Skip generic filler ("team player", "fast-paced").
- Ignore benefits, legal boilerplate and company marketing.`;

export async function parseJob(text: string, hints: FetchedJob["hints"] = {}): Promise<ParsedJob> {
  if (text.trim().length < 80) throw new HttpError(400, "That job description is too short to analyse.");
  if (!aiEnabled()) return heuristicParse(text, hints);
  const parsed = await aiJson({
    schema: parsedJobSchema,
    system: JOB_SYSTEM,
    effort: "low",
    prompt: `${hints.title ? `Listing title: ${hints.title}\n` : ""}${hints.company ? `Company: ${hints.company}\n` : ""}${hints.location ? `Location: ${hints.location}\n` : ""}\n<job_description>\n${text.slice(0, 40000)}\n</job_description>`,
  });
  return {
    ...parsed,
    title: parsed.title || hints.title || "",
    company: parsed.company || hints.company || "",
    location: parsed.location || hints.location || "",
  };
}

function heuristicParse(text: string, hints: FetchedJob["hints"]): ParsedJob {
  const norm = normalize(text);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const found = COMMON_SKILLS.filter((s) => containsTerm(norm, s));

  // Split skills into must/nice by which section of the posting they appear in.
  let mode: "must" | "nice" | "other" = "other";
  const mustText: string[] = [];
  const niceText: string[] = [];
  const responsibilities: string[] = [];
  for (const l of lines) {
    if (/^(requirements|qualifications|what you('ll)? (need|bring)|you have|must have|about you|skills)/i.test(l) && l.length < 60) mode = "must";
    else if (/(nice to have|preferred|bonus|plus|desirable)/i.test(l) && l.length < 60) mode = "nice";
    else if (/^(responsibilities|what you('ll)? do|the role|your role|day to day)/i.test(l) && l.length < 60) mode = "other";
    else if (mode === "must") mustText.push(l);
    else if (mode === "nice") niceText.push(l);
    else if (/^[•\-*]/.test(l) && responsibilities.length < 8) responsibilities.push(l.replace(/^[•\-*]\s*/, ""));
  }
  const inMust = normalize(mustText.join(" "));
  const inNice = normalize(niceText.join(" "));
  const mustHave = found.filter((s) => containsTerm(inMust, s));
  const niceToHave = found.filter((s) => !mustHave.includes(s) && containsTerm(inNice, s));
  const keywords = found.filter((s) => !mustHave.includes(s) && !niceToHave.includes(s));
  const years = text.match(/(\d+\+?)\s*(?:\+\s*)?years?/i)?.[0] ?? "";
  return {
    title: hints.title || lines[0]?.slice(0, 100) || "Untitled role",
    company: hints.company || "",
    location: hints.location || "",
    seniority: /\b(senior|sr\.?)\b/i.test(hints.title ?? text.slice(0, 300)) ? "Senior" : /\b(junior|graduate|entry)\b/i.test(text.slice(0, 500)) ? "Junior" : "",
    summary: lines.find((l) => l.length > 80)?.slice(0, 300) ?? "",
    mustHave: mustHave.length ? mustHave : found.slice(0, 8),
    niceToHave,
    responsibilities,
    keywords: mustHave.length ? keywords : found.slice(8),
    yearsExperience: years,
    education: text.match(/(bachelor'?s|master'?s|phd|degree)[^.\n]{0,60}/i)?.[0] ?? "",
  };
}
