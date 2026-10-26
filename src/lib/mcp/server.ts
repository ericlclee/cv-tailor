import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { tracker } from "../activity";
import { AMBITION, ambitionName, toAmbition, type Ambition, type CvRating } from "../ambition";
import { addEvent, changeStatus, createApplication, findApplicationByUrl, getApplication, listApplications, saveJob, STATUS_LABEL } from "../applications";
import { masterForPrompt, refreshSuggestions } from "../coach";
import { applyEdits, prepareEdits } from "../cv-edits";
import { get, getMaster, getProfile, getSkills, newId, put, remove, setProfile, setSkills, type Master } from "../db";
import { entryKind, extractMetrics, toAchievement, toEntry } from "../entries";
import { fetchJob } from "../jobs";
import { containsTerm, cvPlainText, keywordReport, normalize } from "../keywords";
import { analyzeRequirements, backedCount, requirementKey } from "../requirements";
import { profileStrength } from "../strength";
import { buildCvFromPlan, buzzwords, flagNumbers, nearCopies, rateCv, underpowered, UNLINKED_WARNING } from "../tailor";
import type { ActivityDetail, AppStatus, CvContent, Entry, ParsedJob } from "../types";

// The CV Tailor MCP server. The user's own chat model does the thinking and
// writing; these tools read and change the data, check CVs against the
// evidence, and record every change in the activity feed (with undo).

/** Where the web app lives, for links in tool results: APP_URL, else Vercel's production address, else localhost. */
export const appUrl = () => {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return (process.env.APP_URL || (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/$/, "");
};

// How the chat curates a listing: once per application, stored, then reused.
const CURATE = `Curate the listing once: rewrite it as a clean job description in its own words, lightly tidied into short paragraphs and bullet lists. Keep the role title, company and team context, location and working pattern, salary if given, what the role does, responsibilities, requirements and nice-to-haves. Cut everything else: site navigation, cookie and privacy notices, apply and share links, other jobs, generic company boilerplate, benefits lists, and equal-opportunity or legal text. Then list the requirements: mustHave and niceToHave as short ATS terms (1–4 words, the job's exact spelling), splitting combined ones ("Python and SQL" becomes "Python", "SQL"), with years of experience and education in their own fields. Finally link each requirement to the user's achievements that genuinely show it (ids from the achievements list), judging meaning rather than wording: "evals" is shown by an achievement about building evaluators, "AI agents" by one about testing agent tool calls. Leave a requirement unlinked if nothing shows it. Save it all with set_job_details.`;

const INSTRUCTIONS = `CV Tailor keeps the user's master profile (an evidence bank of roles, projects, education and individual achievements) and their job applications, and turns them into persuasive, ATS-friendly CVs that win interviews. The user watches everything live in the CV Tailor web app (${appUrl()}): every change you make appears there with an Undo button.

Workflow:
1. Start with get_overview. If the profile is empty, ask the user for their CV (they can attach it to the chat) and record it with update_profile.
2. Strengthen the profile one question at a time: missing numbers, thin roles, unproven skills, forgotten experience (mentoring, process fixes, side projects). Record answers with update_profile.
3. When the user shares a job (link or text), call create_application. If it says the listing needs curating, do it straight away: ${CURATE} Curation is stored with the application and marked done, so never repeat it for an application that's already curated (get_application says so) unless the user asks you to, or the listing has changed.
4. Call get_application to see which requirements have evidence. Ask about each missing must-have. If they have it, add the evidence with update_profile, then link the new achievement to the requirement with link_requirements. If not, call mark_not_claimed.
5. Before writing a CV, tell the user the application's ambition level (get_application shows it; Elevated unless they chose another) and offer the four levels in a line. If they pick another, set it with update_application. Then write the CV yourself at that level and save it with save_cv. Refine it with edit_cv when the user asks.
6. Keep the application current with update_application (applied, interview dates, outcome, notes).

Ambition (most important): the user decides, per application, how far the CV goes beyond their profile. Write to the application's level, never below it and never above it unless the user asks.
Calibrate to the role before writing at Polished or above: sketch, for yourself, the top candidate for this job. What scale do they work at (users, revenue, clients, team size)? What seniority markers do they show (strategy, standards across teams, hiring, external stakeholders)? What results would their CV quote? The levels are measured as how much of the gap between the user's profile and that candidate the CV closes. A user who is already close to the role still gets written up to the candidate.
${AMBITION.map((a) => `- ${a.level} ${a.name}: ${a.writer} Required: ${a.requires}`).join("\n")}
Rate every bullet and the summary you write on the same 0–3 scale (0 the profile's facts, reframed; 1 numbers pushed up or natural responsibilities added; 2 a clearly more senior version: inflated scope or numbers, initiatives led, adjacent skills; 3 model-candidate content: achievements, figures or responsibilities written for the ideal hire). Rate honestly: the CV tab highlights each line by its rating so the user can see what they'll need to back up. The server raises a rating it can see is too low, and flags underpowered lines (more than one level below the chosen level, or missing what the level requires) to raise with edit_cv.
Hard limits at every level, because they are checked and get offers withdrawn: never invent employers, job titles, dates, degrees or certifications, and never claim a requirement the user marked as not having (mark_not_claimed).
Every CV bullet must cite the achievement ids it is based on.

Writing the CV (at every level): the master profile is the plain factual baseline, written to be complete, not persuasive. The CV is a new document that frames those facts in the best possible way for this one job. Never copy achievement text across.
- Start from what the job values most (its responsibilities and must-haves). Choose and order bullets by relevance to it, not by the profile's order.
- Frame every bullet as strongly as the ambition level allows: the outcome or the scale first, then what the user did, with the strongest verb the level supports. Make it read like the work of someone already doing the target job.
- One tight line of about 15–25 words per bullet. Drop tool lists, internal names and detail this job doesn't care about.
- Combine related achievements into one bullet, or split a dense one, citing every source id.
- Use the job's vocabulary for the same thing, but write plainly: concrete nouns, numbers and outcomes, not adjectives. No filler like "spearheaded", "leveraged", "synergy", "results-driven", "passionate", "cutting-edge", "best-in-class", "dynamic" or "innovative", and no stacking several job keywords into one line.
- The summary is 2–3 sentences pitched at this role, not a recap of the latest job. Order and name skills the way the job does.
Ambition controls which facts may change, never whether to reframe: a Faithful bullet still reads as strongly framed for this job. The server flags near-copies of the profile and buzzword filler; fix them with edit_cv.

Keep chat replies short and point the user to the web app to see and download results.`;

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 1));
// Coerced: some chat clients send numbers as strings.
const ambitionLevel = z.coerce.number().int().min(0).max(3);
const fail = (s: string) => ({ content: [{ type: "text" as const, text: s }], isError: true });

function appLink(id: string, tab?: "cv" | "timeline") {
  return `${appUrl()}/apps/${id}${tab ? `?tab=${tab}` : ""}`;
}

async function needApp(id: string) {
  const job = await getApplication(id);
  if (!job) throw new Error(`No application with id "${id}". Call get_overview to see the ids.`);
  return job;
}

/** Plain view of a CV with the ids the edit tools need. */
function cvView(content: CvContent, rating: CvRating) {
  return {
    headline: content.header.headline,
    summary: content.summary,
    summaryAmbition: ambitionName(rating.summary),
    skills: content.skills,
    sections: content.sections
      .filter((s) => s.include)
      .map((s) => ({
        title: s.title,
        items: s.items
          .filter((i) => i.include)
          .map((i) => ({
            itemId: i.id,
            role: [i.title, i.organization].filter(Boolean).join(", "),
            dates: i.dates,
            bullets: i.bullets.filter((b) => b.include).map((b) => ({ bulletId: b.id, text: b.text, sourceIds: b.sourceIds, ambition: ambitionName(rating.bullets[b.id] ?? 0), ...(b.warning ? { warning: b.warning } : {}) })),
          })),
      })),
  };
}

function cvWarnings(content: CvContent, unclaimed: string[]) {
  const out: { bulletId: string; text: string; warning: string }[] = [];
  const all = content.sections.flatMap((s) => (s.include ? s.items.flatMap((i) => (i.include ? i.bullets.filter((b) => b.include) : [])) : []));
  for (const b of all) if (b.warning) out.push({ bulletId: b.id, text: b.text, warning: b.warning });
  const plain = normalize(cvPlainText(content));
  for (const u of unclaimed) {
    if (containsTerm(plain, u)) out.push({ bulletId: "", text: u, warning: `The CV mentions "${u}", which the user said they don't have.` });
  }
  return out;
}

/** How a CV's lines spread across the levels, and which go above the application's level. */
function ambitionReport(content: CvContent, rating: CvRating, chosen: Ambition, m: Master, job: { parsed: ParsedJob; unclaimed: string[] }) {
  const lines = content.sections.flatMap((s) => (s.include ? s.items.flatMap((i) => (i.include ? i.bullets.filter((b) => b.include) : [])) : []));
  const counts = Object.fromEntries(AMBITION.map((a) => [a.name, lines.filter((b) => (rating.bullets[b.id] ?? 0) === a.level).length]));
  const above = lines.filter((b) => (rating.bullets[b.id] ?? 0) > chosen).map((b) => ({ bulletId: b.id, text: b.text, ambition: ambitionName(rating.bullets[b.id]) }));
  if (rating.summary > chosen) above.push({ bulletId: "summary", text: content.summary, ambition: ambitionName(rating.summary) });
  const weak = underpowered(content, rating, chosen, m);
  // At Bold every must-have the user's work touches should be covered.
  const unclaimed = new Set(job.unclaimed.map((u) => u.toLowerCase()));
  const uncovered = chosen === 3 ? keywordReport(cvPlainText(content), job.parsed).mustHaveMissing.filter((t) => !unclaimed.has(t.toLowerCase())) : [];
  return {
    chosen: ambitionName(chosen),
    required: AMBITION[chosen].requires,
    lines: counts,
    underpowered: weak.length ? weak : undefined,
    uncoveredMustHaves: uncovered.length ? uncovered : undefined,
    aboveChosenLevel: above.length ? above : undefined,
    skillsBeyondProfile: Object.keys(rating.skills).length ? Object.keys(rating.skills) : undefined,
  };
}

const ambitionSetting = (l: Ambition) => ({ level: l, name: ambitionName(l), howToWrite: AMBITION[l].writer });

/** The user's achievements with ids, for linking requirements to evidence while curating. */
const achievementList = (m: Master) => m.entries.flatMap((e) => e.achievements.map((a) => ({ id: a.id, role: entryLabel(e), text: a.text })));

/** Keep only links to real achievements, keyed the way analyzeRequirements looks them up. */
function linksFrom(links: { requirement: string; achievementIds: string[] }[], m: Master) {
  const ids = new Set(m.entries.flatMap((e) => e.achievements.map((a) => a.id)));
  return Object.fromEntries(links.map((l) => [requirementKey(l.requirement), l.achievementIds.filter((id) => ids.has(id))] as const));
}

const linkList = z.array(z.object({ requirement: z.string().describe("The requirement exactly as in mustHave or niceToHave"), achievementIds: z.array(z.string()).describe("Achievements that genuinely show it; empty if none") }));
const parseJson = (v: string): unknown => {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
// Also accepted as JSON text: chat apps holding an older copy of the tool list send new fields as strings.
const linkShape = z.union([
  linkList,
  z.string().transform((v, ctx) => {
    const parsed = linkList.safeParse(parseJson(v));
    if (parsed.success) return parsed.data;
    ctx.addIssue({ code: "custom", message: "Expected a list of { requirement, achievementIds }." });
    return z.NEVER;
  }),
]);

const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;

const entryLabel = (e: Pick<Entry, "title" | "organization">) => [e.title, e.organization].filter(Boolean).join(", ");

export function createMcpServer() {
  const server = new McpServer({ name: "cv-tailor", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  // -------------------------------------------------------------------------
  // Reading

  server.registerTool(
    "get_overview",
    {
      title: "Get overview",
      description: "Start here. Returns the profile's strength, the open questions that would strengthen it, every application with its status and id, and the web app link.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const m = await getMaster();
      return json({
        webApp: appUrl(),
        profile: {
          name: m.profile.name,
          strength: `${profileStrength(m)}/100`,
          entries: m.entries.length,
          achievements: m.entries.reduce((n, e) => n + e.achievements.length, 0),
          skills: m.skills.length,
        },
        questionsToStrengthenProfile: m.entries.length ? (await refreshSuggestions()).slice(0, 8).map((s) => ({ question: s.question, why: s.reason })) : ["The profile is empty. Ask the user for their CV or their most recent role."],
        applications: (await listApplications()).map((a) => ({ id: a.id, role: a.title, company: a.company, status: STATUS_LABEL[a.status], listing: a.curated ? "curated" : "needs curating (see get_application)", link: appLink(a.id) })),
      });
    },
  );

  server.registerTool(
    "get_profile",
    {
      title: "Get master profile",
      description: "The full master profile: contact details, skills, and every entry (role, project, education…) with its achievements and their ids. Use the ids with update_profile and save_cv.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const m = await getMaster();
      const { links, ...contact } = m.profile;
      return text(`<contact>\n${JSON.stringify({ ...contact, links }, null, 1)}\n</contact>\n\n<profile>\n${masterForPrompt(m)}\n</profile>`);
    },
  );

  server.registerTool(
    "get_application",
    {
      title: "Get application",
      description:
        "One application: the job's details and curated listing, each requirement with the achievements that prove it (proven, weak, gap, or not claimed), the current CV with bullet and item ids, the timeline, notes, and links to view and download. If the listing hasn't been curated yet, it includes the raw text to curate.",
      inputSchema: { application_id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ application_id }) => {
      const job = await needApp(application_id);
      const m = await getMaster();
      const reqs = analyzeRequirements(job.parsed, m.entries, m.skills, job.unclaimed, job.evidence);
      const cv = job.cvId ? await get("cvs", job.cvId) : null;
      const rating = cv ? rateCv(cv.content, m) : null;
      return json({
        id: job.id,
        status: STATUS_LABEL[job.status],
        ambition: ambitionSetting(job.ambition),
        job: job.parsed,
        ...(job.curatedAt
          ? { listing: { curated: job.curatedAt, note: "Already curated: use this description and these requirements; don't curate again unless the user asks.", description: job.description ?? "" } }
          : { listing: { curated: false, nextStep: `This listing hasn't been curated, so the requirements above are only a rough keyword guess. ${CURATE}`, rawText: job.rawText.slice(0, 15000), achievements: achievementList(m) } }),
        source: job.url || "pasted description",
        requirements: { backed: `${backedCount(reqs)} of ${reqs.length}`, list: reqs.map((r) => ({ name: r.name, weight: r.weight, state: r.state, evidence: r.proofs.map((p) => ({ achievementId: p.achievementId, text: p.text })) })) },
        notClaimed: job.unclaimed,
        cv: cv && rating ? { ...cvView(cv.content, rating), ambition: ambitionReport(cv.content, rating, job.ambition, m, job), warnings: cvWarnings(cv.content, job.unclaimed), keywordCoverage: `${keywordReport(cvPlainText(cv.content), job.parsed).score}%` } : null,
        timeline: job.events.map((e) => ({ at: e.at, title: e.title, detail: e.detail })),
        notes: job.notes,
        links: { view: appLink(job.id), cv: appLink(job.id, "cv"), ...(cv ? { pdf: `${appUrl()}/api/cvs/${cv.id}/export?format=pdf`, docx: `${appUrl()}/api/cvs/${cv.id}/export?format=docx` } : {}) },
      });
    },
  );

  // -------------------------------------------------------------------------
  // Profile

  const newAchievement = z.object({ text: z.string(), skills: z.array(z.string()).optional().describe("Skills, tools or methods this shows") });
  server.registerTool(
    "update_profile",
    {
      title: "Update master profile",
      description:
        "Change the master profile: contact details, entries (roles, projects, education…), achievements and skills. Use it to record an imported CV, answers to questions, or corrections. Only record facts the user gave you. Dates are YYYY-MM or YYYY. Every change can be undone in the web app.",
      inputSchema: {
        summary: z.string().describe("A few words describing the change, shown in the activity feed, e.g. 'Added hackathon to Brightcart'"),
        contact: z
          .object({
            name: z.string().optional(),
            headline: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            location: z.string().optional(),
            summary: z.string().optional(),
            links: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
          })
          .optional(),
        addEntries: z
          .array(
            z.object({
              kind: entryKind,
              title: z.string(),
              organization: z.string().optional(),
              location: z.string().optional(),
              startDate: z.string().optional(),
              endDate: z.string().optional(),
              current: z.boolean().optional(),
              description: z.string().optional(),
              url: z.string().optional(),
              achievements: z.array(newAchievement).optional(),
            }),
          )
          .optional(),
        updateEntries: z
          .array(
            z.object({
              entryId: z.string(),
              title: z.string().optional(),
              organization: z.string().optional(),
              location: z.string().optional(),
              startDate: z.string().optional(),
              endDate: z.string().optional(),
              current: z.boolean().optional(),
              description: z.string().optional(),
            }),
          )
          .optional(),
        removeEntryIds: z.array(z.string()).optional(),
        addAchievements: z.array(newAchievement.extend({ entryId: z.string() })).optional(),
        updateAchievements: z.array(z.object({ achievementId: z.string(), text: z.string().optional(), skills: z.array(z.string()).optional() })).optional(),
        removeAchievementIds: z.array(z.string()).optional(),
        addSkills: z.array(z.object({ name: z.string(), category: z.string().optional() })).optional(),
        removeSkills: z.array(z.string()).optional().describe("Skill names"),
      },
      annotations: { destructiveHint: false },
    },
    async (input) => {
      const t = tracker();
      const details: ActivityDetail[] = [];
      const problems: string[] = [];
      const m = await getMaster();
      const entries = new Map(m.entries.map((e) => [e.id, structuredClone(e)]));
      const touched = new Set<string>();
      const findAch = (id: string) => {
        for (const e of entries.values()) {
          const a = e.achievements.find((x) => x.id === id);
          if (a) return { e, a };
        }
        return null;
      };

      if (input.contact && Object.values(input.contact).some((v) => v !== undefined)) {
        await t.kv("profile");
        const p = { ...await getProfile() };
        for (const [k, v] of Object.entries(input.contact)) if (v !== undefined) (p as Record<string, unknown>)[k] = v;
        await setProfile(p);
        details.push({ label: "Contact details", after: [p.name, p.headline, p.email, p.location].filter(Boolean).join(" · ") });
      }
      for (const u of input.updateEntries ?? []) {
        const e = entries.get(u.entryId);
        if (!e) {
          problems.push(`No entry ${u.entryId}`);
          continue;
        }
        const before = entryLabel(e);
        Object.assign(e, Object.fromEntries(Object.entries(u).filter(([k, v]) => k !== "entryId" && v !== undefined)));
        touched.add(e.id);
        details.push({ label: "Updated entry", before, after: entryLabel(e) });
      }
      for (const n of input.addAchievements ?? []) {
        const e = entries.get(n.entryId);
        if (!e) {
          problems.push(`No entry ${n.entryId} for "${n.text}"`);
          continue;
        }
        e.achievements.push(toAchievement({ text: n.text, skills: n.skills ?? [], metrics: [] }));
        touched.add(e.id);
        details.push({ label: `Added to ${entryLabel(e)}`, after: n.text });
      }
      for (const u of input.updateAchievements ?? []) {
        const hit = findAch(u.achievementId);
        if (!hit) {
          problems.push(`No achievement ${u.achievementId}`);
          continue;
        }
        const before = hit.a.text;
        if (u.text !== undefined) {
          hit.a.text = u.text;
          hit.a.metrics = extractMetrics(u.text);
        }
        if (u.skills) hit.a.skills = u.skills;
        touched.add(hit.e.id);
        details.push({ label: `Updated in ${entryLabel(hit.e)}`, before, after: hit.a.text });
      }
      for (const id of input.removeAchievementIds ?? []) {
        const hit = findAch(id);
        if (!hit) {
          problems.push(`No achievement ${id}`);
          continue;
        }
        hit.e.achievements = hit.e.achievements.filter((a) => a.id !== id);
        touched.add(hit.e.id);
        details.push({ label: `Removed from ${entryLabel(hit.e)}`, before: hit.a.text });
      }
      for (const id of touched) {
        await t.doc("entries", id);
        await put("entries", { ...entries.get(id)!, updatedAt: new Date().toISOString() });
      }
      for (const id of input.removeEntryIds ?? []) {
        const e = await get("entries", id);
        if (!e) {
          problems.push(`No entry ${id}`);
          continue;
        }
        await t.doc("entries", id);
        await remove("entries", id);
        details.push({ label: "Removed entry", before: entryLabel(e) });
      }
      for (const ne of input.addEntries ?? []) {
        const id = newId();
        await t.doc("entries", id);
        const entry = toEntry({ ...ne, id, sort: 0, achievements: (ne.achievements ?? []).map((a) => ({ text: a.text, skills: a.skills ?? [], metrics: [] })) });
        await put("entries", entry);
        details.push({ label: `New ${ne.kind}`, after: [entryLabel(entry), ...entry.achievements.map((a) => `• ${a.text}`)].join("\n") });
      }
      if (input.addSkills?.length || input.removeSkills?.length) {
        await t.kv("skills");
        const drop = new Set((input.removeSkills ?? []).map((s) => s.toLowerCase()));
        const skills = (await getSkills()).filter((s) => !drop.has(s.name.toLowerCase()));
        const names = new Set(skills.map((s) => s.name.toLowerCase()));
        const added: string[] = [];
        for (const s of input.addSkills ?? []) {
          if (!names.has(s.name.toLowerCase())) {
            names.add(s.name.toLowerCase());
            skills.push({ id: newId(), name: s.name, category: s.category ?? "" });
            added.push(s.name);
          }
        }
        await setSkills(skills);
        if (added.length) details.push({ label: "Skills added", after: added.join(", ") });
        if (drop.size) details.push({ label: "Skills removed", before: [...drop].join(", ") });
      }

      if (!details.length) return fail(`Nothing changed. ${problems.join("; ")}`);
      await t.record({ kind: "profile", summary: input.summary, details });
      const after = await getMaster();
      return json({
        saved: true,
        changes: details.length,
        problems,
        strength: `${profileStrength(after)}/100`,
        nextQuestions: (await refreshSuggestions()).slice(0, 3).map((s) => s.question),
        seeIt: appUrl(),
      });
    },
  );

  // -------------------------------------------------------------------------
  // Applications

  server.registerTool(
    "create_application",
    {
      title: "Create application",
      description:
        "Start tracking a job. Give a link (Greenhouse, Lever, Ashby, Workday and most career pages are read automatically; LinkedIn and Indeed usually block it) or paste the full description. Returns the raw listing for you to curate once with set_job_details. If the link is already tracked, returns that application instead.",
      inputSchema: {
        url: z.string().optional().describe("Link to the job listing"),
        description: z.string().optional().describe("The full job description, if there's no link or the link can't be read"),
      },
    },
    async ({ url, description }) => {
      if (!url && !description?.trim()) return fail("Give a link or the job description.");
      const existing = url ? await findApplicationByUrl(url) : null;
      if (existing) {
        return json({
          applicationId: existing.id,
          alreadyTracked: true,
          role: [existing.parsed.title, existing.parsed.company].filter(Boolean).join(" at "),
          listing: existing.curatedAt ? "curated" : "needs curating",
          nextStep: existing.curatedAt ? "This job is already tracked and its listing curated. Carry on with get_application; don't curate it again." : "This job is already tracked but its listing hasn't been curated. Call get_application for the raw text and curate it.",
          link: appLink(existing.id),
        });
      }
      let input: Parameters<typeof createApplication>[0];
      if (description?.trim()) {
        input = { text: description, url: url ?? "", source: url ? "Pasted" : "Pasted" };
      } else {
        try {
          const f = await fetchJob(url!);
          input = { text: f.text, url, source: f.source, hints: f.hints };
        } catch (err) {
          return fail(`${err instanceof Error ? err.message : "Couldn't read that link."} Ask the user to paste the description, then call create_application with it.`);
        }
      }
      const job = await createApplication(input);
      const t = tracker();
      await t.doc("jobs", job.id);
      // The "before" of a new application is nothing, so undo removes it.
      await t.record({ kind: "application", summary: `Started an application: ${[job.parsed?.title, job.parsed?.company].filter(Boolean).join(" at ") || "new job"}`, appId: job.id });
      return json({
        applicationId: job.id,
        link: appLink(job.id),
        listing: "needs curating",
        nextStep: `Curate it now, before anything else. ${CURATE} The rough keyword guess below is only a starting point.`,
        firstGuess: job.parsed,
        rawText: job.rawText.slice(0, 15000),
        achievements: achievementList(await getMaster()),
      });
    },
  );

  server.registerTool(
    "set_job_details",
    {
      title: "Curate job listing",
      description:
        "Save the curated listing for an application: the cleaned-up job description and what the job asks for. Do this once per application (the server marks it done); call it again only if the user asks or the listing changed. mustHave and niceToHave are short ATS terms (1–4 words, the job's exact spelling, e.g. 'Python', 'stakeholder management'). These drive the requirement-to-evidence match.",
      inputSchema: {
        application_id: z.string(),
        description: z.string().describe("The listing slimmed down to the job description itself: role, team and company context, location, salary, responsibilities, requirements. No navigation, cookie notices, benefits lists, other jobs or legal boilerplate."),
        title: z.string(),
        company: z.string(),
        location: z.string().optional(),
        seniority: z.string().optional(),
        summary: z.string().optional().describe("Two sentences on what the role is about"),
        mustHave: z.array(z.string()),
        niceToHave: z.array(z.string()).optional(),
        keywords: z.array(z.string()).optional().describe("Other terms an ATS would scan for"),
        responsibilities: z.array(z.string()).optional(),
        yearsExperience: z.string().optional().describe("e.g. '5+ years', or empty"),
        education: z.string().optional(),
        evidence: linkShape.optional().describe("For each requirement, the achievement ids that prove it (judge meaning, not wording)"),
      },
    },
    async (i) => {
      const job = await needApp(i.application_id);
      const m = await getMaster();
      const t = tracker();
      await t.doc("jobs", job.id);
      job.parsed = {
        title: i.title,
        company: i.company,
        location: i.location ?? "",
        seniority: i.seniority ?? "",
        summary: i.summary ?? "",
        mustHave: i.mustHave,
        niceToHave: i.niceToHave ?? [],
        keywords: i.keywords ?? [],
        responsibilities: i.responsibilities ?? [],
        yearsExperience: i.yearsExperience ?? "",
        education: i.education ?? "",
      };
      const again = Boolean(job.curatedAt);
      job.description = i.description.trim();
      job.curatedAt = new Date().toISOString();
      if (i.evidence) job.evidence = linksFrom(i.evidence, m);
      await saveJob(job);
      await t.record({ kind: "job", summary: `${again ? "Re-curated" : "Curated"} the listing for ${i.title}`, appId: job.id, details: [{ label: "Listing", after: `${wordCount(job.rawText)} words cut to ${wordCount(job.description)}` }, { label: "Must have", after: i.mustHave.join(", ") }, ...(i.niceToHave?.length ? [{ label: "Nice to have", after: i.niceToHave.join(", ") }] : [])] });
      const reqs = analyzeRequirements(job.parsed, m.entries, m.skills, job.unclaimed, job.evidence);
      return json({
        saved: true,
        listing: "curated (stored; no need to do it again)",
        ...(i.evidence ? {} : { evidence: "Not linked: requirements only match achievements that use the same words. Link them with link_requirements." }),
        backed: `${backedCount(reqs)} of ${reqs.length} requirements have evidence`,
        gaps: reqs.filter((r) => r.state === "gap").map((r) => `${r.name} (${r.weight})`),
        weak: reqs.filter((r) => r.state === "weak").map((r) => r.name),
        nextStep: "Ask the user about each gap, one at a time. Add evidence with update_profile, or call mark_not_claimed if they don't have it.",
        link: appLink(job.id),
      });
    },
  );

  server.registerTool(
    "link_requirements",
    {
      title: "Link requirements to evidence",
      description:
        "Set which of the user's achievements prove each requirement of an application, judging meaning rather than wording. Use it after adding new evidence for a gap, or to fix a link. Each requirement you list replaces its earlier links; others are kept.",
      inputSchema: { application_id: z.string(), links: linkShape },
    },
    async ({ application_id, links }) => {
      const job = await needApp(application_id);
      const m = await getMaster();
      const t = tracker();
      await t.doc("jobs", job.id);
      job.evidence = { ...(job.evidence ?? {}), ...linksFrom(links, m) };
      await saveJob(job);
      const reqs = analyzeRequirements(job.parsed, m.entries, m.skills, job.unclaimed, job.evidence);
      await t.record({ kind: "job", summary: `Linked evidence for ${links.length} requirement${links.length === 1 ? "" : "s"}`, appId: job.id, details: links.map((l) => ({ label: l.requirement, after: `${l.achievementIds.length} achievement${l.achievementIds.length === 1 ? "" : "s"}` })) });
      return json({
        saved: true,
        backed: `${backedCount(reqs)} of ${reqs.length} requirements have evidence`,
        gaps: reqs.filter((r) => r.state === "gap").map((r) => `${r.name} (${r.weight})`),
        link: appLink(job.id),
      });
    },
  );

  server.registerTool(
    "mark_not_claimed",
    {
      title: "Mark requirements as not claimed",
      description: "Record requirements the user doesn't have, so the CV never claims them.",
      inputSchema: { application_id: z.string(), requirements: z.array(z.string()) },
    },
    async ({ application_id, requirements }) => {
      const job = await needApp(application_id);
      const t = tracker();
      await t.doc("jobs", job.id);
      const have = new Set(job.unclaimed.map((u) => u.toLowerCase()));
      job.unclaimed = [...job.unclaimed, ...requirements.filter((r) => !have.has(r.toLowerCase()))];
      await saveJob(job);
      await t.record({ kind: "job", summary: `Won't claim: ${requirements.join(", ")}`, appId: job.id });
      return text(`Noted. The CV won't claim ${requirements.join(", ")}.`);
    },
  );

  // -------------------------------------------------------------------------
  // CVs

  server.registerTool(
    "save_cv",
    {
      title: "Save tailored CV",
      description: `Save the CV you wrote for an application (replaces any previous version; undo restores it). Write it at the application's ambition level (see get_application) and rate every bullet and the summary 0–3. You choose which entries and achievements to use and rewrite them for the job in your own words (near-copies of the profile are flagged); titles, employers and dates come from the profile automatically. Every bullet must list the achievement ids it is based on. The server flags numbers that aren't in those sources and skills the profile doesn't show (so the user can prepare for them), and warns if a not-claimed requirement appears. Typical one-page CV: 3–5 bullets for the most relevant recent roles, 1–2 for older ones. Entries you leave out are hidden but kept for the user to add back; education is shown by default.`,
      inputSchema: {
        application_id: z.string(),
        headline: z.string().describe("Short professional headline aimed at this job"),
        summary: z.string().describe("2–4 sentence summary aimed at this job, no first person"),
        summaryAmbition: ambitionLevel.describe("Your 0–3 ambition rating of the summary"),
        skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
        sectionOrder: z.array(entryKind).describe("Usually experience first; projects or education first for students and career changers"),
        entries: z.array(
          z.object({
            entryId: z.string(),
            include: z.boolean().optional().describe("false hides the entry"),
            bullets: z.array(
              z.object({
                text: z.string(),
                sourceIds: z.array(z.string()).describe("Achievement ids this bullet is based on"),
                ambition: ambitionLevel.describe("Your 0–3 rating of how far this line goes beyond its sources"),
              }),
            ),
          }),
        ),
      },
    },
    async (i) => {
      const job = await needApp(i.application_id);
      const m = await getMaster();
      if (!m.entries.length) return fail("The master profile is empty. Build it first with update_profile.");
      const unknown = i.entries.filter((e) => !m.entries.some((x) => x.id === e.entryId)).map((e) => e.entryId);
      const { content, unbackedSkills } = buildCvFromPlan(m, { ...i, entries: i.entries.map((e) => ({ ...e, include: e.include ?? true })) });

      const t = tracker();
      const existing = job.cvId ? await get("cvs", job.cvId) : null;
      const cvId = existing?.id ?? newId();
      await t.doc("cvs", cvId);
      await t.doc("jobs", job.id);
      const now = new Date().toISOString();
      await put("cvs", { id: cvId, jobId: job.id, name: [job.parsed.title, job.parsed.company].filter(Boolean).join(" · ") || "Tailored CV", content, notes: [], ambition: job.ambition, createdAt: existing?.createdAt ?? now, updatedAt: now });
      job.cvId = cvId;
      if (job.status === "saved") changeStatus(job, "cv", "Written in your chat and checked against your evidence.");
      await saveJob(job);

      const warnings = cvWarnings(content, job.unclaimed);
      const copied = nearCopies(content, m);
      const filler = buzzwords(content);
      const ambition = ambitionReport(content, rateCv(content, m), job.ambition, m, job);
      const report = keywordReport(cvPlainText(content), job.parsed);
      const bullets = content.sections.flatMap((s) => (s.include ? s.items.flatMap((x) => (x.include ? x.bullets.filter((b) => b.include) : [])) : [])).length;
      await t.record({
        kind: "cv",
        summary: existing ? "Rewrote the CV" : "Drafted the CV",
        appId: job.id,
        details: [{ label: "CV", after: `${bullets} bullets at ${ambition.chosen} · ${report.matched.length} of ${report.matched.length + report.missing.length} job keywords${warnings.length ? ` · ${warnings.length} to check` : ""}` }],
      });
      return json({
        saved: true,
        bullets,
        keywordCoverage: `${report.score}%`,
        missingMustHaves: report.mustHaveMissing,
        ambition,
        copiedFromProfile: copied.length ? copied : undefined,
        buzzwords: filler.length ? filler : undefined,
        warnings,
        skillsToPrepare: unbackedSkills.length ? `${unbackedSkills.join(", ")} (kept on the CV, but no achievement shows them yet)` : undefined,
        unknownEntryIds: unknown.length ? unknown : undefined,
        cv: cvView(content, rateCv(content, m)),
        links: { view: appLink(job.id, "cv"), pdf: `${appUrl()}/api/cvs/${cvId}/export?format=pdf`, docx: `${appUrl()}/api/cvs/${cvId}/export?format=docx` },
        tellTheUser: `${ambition.underpowered || ambition.uncoveredMustHaves || copied.length || filler.length ? `Before showing the user, fix with edit_cv: ${[ambition.underpowered && `${ambition.underpowered.length} underpowered line${ambition.underpowered.length > 1 ? "s" : ""} (raise each to ${ambition.chosen}: ${ambition.required})`, ambition.uncoveredMustHaves && `must-haves not covered yet: ${ambition.uncoveredMustHaves.join(", ")} (add a line for each the user's work touches; ask the user about the rest)`, copied.length && `${copied.length} line${copied.length > 1 ? "s" : ""} still in the profile's own wording (reframe for this job)`, filler.length && `${filler.length} line${filler.length > 1 ? "s" : ""} with buzzword filler (say it plainly)`].filter(Boolean).join("; ")}. ` : ""}${ambition.aboveChosenLevel ? "Some lines are above the chosen level: tone them down with edit_cv, or tell the user and ask. " : ""}${warnings.length ? "Mention the flagged lines briefly so the user can prepare to back them up in an interview. " : ""}Point them to the CV tab, where each line is highlighted by its ambition.`,
      });
    },
  );

  server.registerTool(
    "edit_cv",
    {
      title: "Edit CV",
      description: "Change an application's CV: replace, remove or add bullets (use ids from get_application), or change the headline or summary. Give sourceIds and an ambition rating for new or rewritten bullets so they can be checked and highlighted.",
      inputSchema: {
        application_id: z.string(),
        summary_of_change: z.string().describe("A few words for the activity feed, e.g. 'Shortened Brightcart'"),
        headline: z.string().optional(),
        summary: z.string().optional(),
        summaryAmbition: ambitionLevel.optional().describe("0–3 rating of a new summary"),
        edits: z
          .array(
            z.object({
              op: z.enum(["replace", "remove", "add"]),
              bulletId: z.string().optional().describe("For replace and remove"),
              itemId: z.string().optional().describe("For add: the CV item (role) id"),
              text: z.string().optional(),
              sourceIds: z.array(z.string()).optional(),
              ambition: ambitionLevel.optional().describe("For replace and add: your 0–3 rating of the new line"),
            }),
          )
          .optional(),
      },
    },
    async (i) => {
      const job = await needApp(i.application_id);
      const cv = job.cvId ? await get("cvs", job.cvId) : null;
      if (!cv) return fail("This application has no CV yet. Write one with save_cv.");
      const edits = prepareEdits(cv.content, (i.edits ?? []).map((e) => ({ op: e.op, bulletId: e.bulletId, itemId: e.itemId, text: e.text, ambition: toAmbition(e.ambition, 0) })));
      if (!edits.length && i.headline === undefined && i.summary === undefined) return fail("None of those edits matched bullets or items in the CV. Check the ids with get_application.");

      const t = tracker();
      await t.doc("cvs", cv.id);
      let content = applyEdits(cv.content, edits);
      // Attach sources to rewritten or added bullets, then re-check numbers.
      const sourcesByText = new Map((i.edits ?? []).filter((e) => e.text && e.sourceIds?.length).map((e) => [e.text!.trim(), e.sourceIds!]));
      const m = await getMaster();
      const achievements = new Map(m.entries.flatMap((e) => e.achievements.map((a) => [a.id, a])));
      content = structuredClone(content);
      for (const s of content.sections)
        for (const it of s.items)
          for (const b of it.bullets) {
            const src = sourcesByText.get(b.text.trim());
            if (src) b.sourceIds = src.filter((id) => achievements.has(id));
            if (b.include && !b.sourceIds.length && edits.some((e) => e.text?.trim() === b.text.trim())) b.warning = UNLINKED_WARNING;
          }
      flagNumbers(content, achievements);
      if (i.headline !== undefined) content.header.headline = i.headline;
      if (i.summary !== undefined) {
        content.summary = i.summary;
        content.summaryAmbition = toAmbition(i.summaryAmbition, 0);
      }
      await put("cvs", { ...cv, content, updatedAt: new Date().toISOString() });

      const details: ActivityDetail[] = edits.map((e) => ({ label: e.op === "add" ? "Added line" : e.op === "remove" ? "Removed line" : "Rewrote line", before: e.previous, after: e.op === "remove" ? undefined : e.text }));
      if (i.summary !== undefined) details.push({ label: "Summary", before: cv.content.summary, after: i.summary });
      if (i.headline !== undefined) details.push({ label: "Headline", before: cv.content.header.headline, after: i.headline });
      await t.record({ kind: "cv", summary: i.summary_of_change, appId: job.id, details });
      const copied = nearCopies(content, m);
      const filler = buzzwords(content);
      const ambition = ambitionReport(content, rateCv(content, m), job.ambition, m, job);
      const toFix = [ambition.underpowered && `raise ${ambition.underpowered.length} underpowered line${ambition.underpowered.length > 1 ? "s" : ""}`, copied.length && "reframe lines still in the profile's wording", filler.length && "remove buzzword filler"].filter(Boolean);
      return json({ saved: true, applied: details.length, ambition, copiedFromProfile: copied.length ? copied : undefined, buzzwords: filler.length ? filler : undefined, next: toFix.length ? `Still to fix with edit_cv: ${toFix.join("; ")}.` : undefined, warnings: cvWarnings(content, job.unclaimed), keywordCoverage: `${keywordReport(cvPlainText(content), job.parsed).score}%`, link: appLink(job.id, "cv") });
    },
  );

  // -------------------------------------------------------------------------
  // Tracking

  const STATUSES = ["saved", "cv", "applied", "interview", "offer", "rejected", "withdrawn"] as const;
  server.registerTool(
    "update_application",
    {
      title: "Update application",
      description: "Track what happened: move the stage (applied, interview, offer, rejected, withdrawn), add a dated timeline event (e.g. an interview time), save notes (recruiter name, salary band), or set the CV's ambition level when the user chooses one.",
      inputSchema: {
        application_id: z.string(),
        status: z.enum(STATUSES).optional(),
        status_detail: z.string().optional().describe("One sentence for the timeline"),
        event: z.object({ title: z.string(), detail: z.string().optional(), date: z.string().optional().describe("ISO date or date-time") }).optional(),
        note: z.string().optional().describe("Appended to the application's notes"),
        ambition: z.enum(["Faithful", "Polished", "Elevated", "Bold"]).optional().describe("The ambition level the user chose for this application's CV"),
      },
    },
    async (i) => {
      const job = await needApp(i.application_id);
      const t = tracker();
      await t.doc("jobs", job.id);
      const parts: string[] = [];
      const details: ActivityDetail[] = [];
      if (i.status && i.status !== job.status) {
        const from = job.status;
        changeStatus(job, i.status as AppStatus, i.status_detail ?? "");
        parts.push(`${STATUS_LABEL[from]} → ${STATUS_LABEL[i.status as AppStatus]}`);
        details.push({ label: "Status", before: STATUS_LABEL[from], after: STATUS_LABEL[i.status as AppStatus] });
      }
      if (i.event) {
        const parsed = i.event.date ? new Date(i.event.date) : null;
        const d = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
        addEvent(job, { at: d.toISOString(), title: i.event.title, detail: i.event.detail ?? "" });
        parts.push(i.event.title);
        const hasTime = /T\d{2}:\d{2}/.test(i.event.date ?? "");
        const label = d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
        details.push({ label: "Timeline", after: `${i.event.title} · ${label}` });
      }
      if (i.note?.trim()) {
        job.notes = [job.notes, i.note.trim()].filter(Boolean).join("\n");
        details.push({ label: "Note", after: i.note.trim() });
      }
      if (i.ambition && toAmbition(i.ambition) !== job.ambition) {
        details.push({ label: "Ambition", before: ambitionName(job.ambition), after: i.ambition });
        parts.push(`Ambition: ${i.ambition}`);
        job.ambition = toAmbition(i.ambition);
      }
      if (!details.length) return fail("Nothing to update.");
      await saveJob(job);
      await t.record({ kind: "status", summary: parts.join(" · ") || "Added a note", appId: job.id, details });
      return text(`Updated. Timeline: ${appLink(job.id, "timeline")}${i.ambition && job.cvId ? `\nThe CV was written at a different level. Offer to rewrite it at ${i.ambition} with save_cv.` : ""}`);
    },
  );

  return server;
}
