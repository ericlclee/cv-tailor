import { AMBITION } from "../ambition";

// Guides: the full instructions for each stage of CV Tailor, which the chat loads with
// get_guide when it reaches that stage, like a skill. The server instructions stay short
// and point here, so a chat only carries the detail for the stages it uses.

// How the chat curates a listing: once per application, stored, then reused.
export const CURATE = `Curate the listing once. Put the title, company, location and working pattern, seniority and salary in their own fields, and a two-sentence summary of the role in summary. Then write the description: the complete job posting, everything about the job itself, in the posting's own words. Keep every part of it: about the company and team, the role overview, responsibilities, qualifications and nice-to-haves, working location and hours, compensation, perks and benefits, and how they work. Only tidy it: one heading per section (e.g. "About Cohere", "The role", "Responsibilities", "Qualifications", "Perks and benefits"), short paragraphs, and bullet lines starting with "- ". Remove only what isn't the posting: other roles and "similar jobs", applicant counts, site navigation and buttons, the site's own prompts and ads, cookie notices, and equal-opportunity, AI-screening or scam-warning boilerplate. Then list the requirements: mustHave and niceToHave as short ATS terms (1–4 words, the job's exact spelling), splitting combined ones ("Python and SQL" becomes "Python", "SQL"), with years of experience and education in their own fields. Finally link each requirement to the user's achievements that genuinely show it (ids from the achievements list), judging meaning rather than wording: "evals" is shown by an achievement about building evaluators, "AI agents" by one about testing agent tool calls. Leave a requirement unlinked if nothing shows it. Save it all with set_job_details.`;

export const GUIDE_TOPICS = ["start", "profile", "refine", "curate", "gaps", "ambition", "writing", "tuning", "tracking"] as const;
export type GuideTopic = (typeof GUIDE_TOPICS)[number];

export const GUIDES: Record<GuideTopic, { title: string; use: string; body: string }> = {
  start: {
    title: "How CV Tailor works",
    use: "the stages in order, and how to explain CV Tailor to the user",
    body: `CV Tailor keeps the user's master profile (an evidence bank of roles, projects, education and individual achievements) and their job applications, and turns them into persuasive, ATS-friendly CVs that win interviews. The web app (its link is in get_overview) shows every change you make live, with an Undo button, highlights each CV line by its ambition, and downloads the CV as PDF or Word.

The stages, with the guide for each:
1. Call get_overview. If the profile is empty, set it up from the user's CV. Guide: profile.
2. Refine it: press for the full story behind every achievement, role and skill. This is what makes every later CV strong, so do it before the first CV unless the user has a job to apply for now; then refine what that job needs most first, and come back to the rest at natural breaks. Guide: refine.
3. When the user shares a job (link or text), call create_application and curate the listing straight away. Guide: curate.
4. Call get_application and close the must-have gaps. Guide: gaps.
5. Agree the ambition level, then write the CV and save it with save_cv. Guides: ambition and writing.
6. Refine it with edit_cv when the user asks, and fix whatever the checks flag. Guide: tuning.
7. Keep the application current. Guide: tracking.

If the user asks how to use CV Tailor, tell them in a few lines: they share a job link or description here; you read the listing and ask about anything it needs that their profile doesn't show; they choose how ambitious the CV should be on the application's CV tab; you write it; they review the highlighted lines in the web app, ask you for changes, and download it.`,
  },

  profile: {
    title: "Setting up the master profile",
    use: "importing a CV and getting every role, project and qualification on record",
    body: `The master profile is the foundation of every CV: the complete, detailed, factual record of what the user has done. A CV can only frame what's on record, so the richer the profile, the stronger every CV. Each achievement holds the full story, with every detail that could matter to some future job, worded as strongly and confidently as the facts allow. Each CV then chooses from it and frames it for one job.

Setting it up:
1. Ask for their CV (attached or pasted). Also ask for anything else that shows their work: an older CV, their LinkedIn profile, performance reviews, a portfolio, project write-ups. These often hold achievements the current CV dropped.
2. Record everything with update_profile: every role (including short, part-time, freelance and internships), project, degree, certification and volunteering, with title, organisation, location and dates (YYYY-MM or YYYY). Keep older and minor ones: each CV chooses what to show.
3. Split every bullet into separate achievements, one per distinct thing they did, with the skills, tools and methods each shows. Keep their numbers exactly. Record the CV straight away: it's evidence they've already given. Each achievement gets its full, strongly worded version once refining has drawn out the rest of its story.
4. Give each role a description: the context a reader needs, such as what the organisation or team does, its size, the user's remit and who they reported to. Ask if the CV doesn't say.
5. Add the skills they've really used, and fill in their contact details.

Then tell them the profile strength (from update_profile or get_overview) and go straight on to refining it (guide: refine). An imported CV is only the starting point: the detail that makes a CV strong comes from questions.`,
  },

  refine: {
    title: "Refining the master profile",
    use: "pressing for the full detail behind every achievement, role and skill, so every CV has strong material",
    body: `Most people undersell their work: they leave out numbers, say "we" for what they did, and forget whole achievements. Draw all of it out, so the profile shows their work in its best light through detail and evidence. Be persistent and curious, like a good career coach preparing a candidate: don't settle for the first vague answer.

Working through it:
- One achievement at a time, starting with the most recent and most important roles (or the ones that matter most for a job the user is targeting). Ask up to three short, specific questions about it in one message, and keep going until it has the full story.
- Hold off recording while you're still gathering. Don't save half a story after each answer. Record the achievement once, with everything you've gathered, when:
  - its story is complete: the context, their own part, the scale and a result (ideally a number), plus recognition if there was any;
  - or the user asks you to update it;
  - or the user has nothing more to add (they don't know, or want to move on);
  - or the conversation is about to change topic or end, so nothing they told you is lost.
- Then record it in one update_profile call (updateAchievements with the full new text, and its skills), tell the user in a line what you saved, and move on to the next one.
- Now and then, say where you are: "Brightcart: 3 of 5 achievements complete. Next: the pricing dashboard."

The full story of an achievement (ask about whatever is missing):
- Context: the problem or goal, why it mattered, what things were like before.
- Their part: what they did themselves, what they decided, owned or led, and who they had to convince. Turn "we", "helped" and "worked on" into their own actions.
- Scale: users, customers, revenue or budget, data volume, team size, systems, regions, how long it took.
- Result: what changed, in numbers where possible: before and after, % or £, time saved, errors cut, adoption, who uses it now, whether it's still in use.
- Recognition: praise, a promotion, an award, other teams adopting it, being asked to repeat or teach it.
- How: the methods, tools and technologies, recorded as skills on the achievement.

Pressing for detail:
- A vague answer: ask again from a different angle, with a concrete example of what you mean ("Roughly how many people used it each week?" rather than "What was the impact?").
- No number: help them estimate with a range, a before and after, a count of something (hours a week, tickets, users, reports) or a comparison ("about twice as fast"). Record it with "about". Ask where the exact figure could be found (a dashboard, a review, a launch email) so they can check it later.
- "It was nothing" or "just my job": ask what would have happened without them, and who benefited. Routine work often hides the best achievements.
- Unsure whether it counts: record it anyway. Each CV decides what to use.
- A thin role: ask what a normal week looked like, then what they're proudest of, and what they fixed, improved, automated, built, launched, taught or led, and what people came to them for.
- Skills no achievement shows: ask where they used each one, and record that story as an achievement.
- Forgotten experience: mentoring, hiring and interviewing, onboarding others, process changes, incidents handled, documentation, talks, side projects, courses, volunteering, awards.

Recording (once the story is complete):
- Word each achievement as strongly and confidently as the facts allow. Lead with the result or the scale. State their ownership plainly, with the strongest verb that's true (led, built, designed, launched, cut, grew, decided, convinced). Include every number, scale and outcome they gave. Two or three sentences is fine when the story needs them.
- No hedging or underselling: never "helped with", "was involved in", "assisted", "tried to" or "some", when they told you what they actually did. If they owned it, say they owned it.
- Confident, not inflated, and plain rather than buzzwords: never add facts, numbers or responsibilities they didn't give you, and no filler like "spearheaded", "leveraged" or "results-driven". Stretching beyond the facts is done per CV, at the ambition level the user picks; the profile is the evidence it works from.
- If an answer reveals a separate achievement, add it on its own.
- Don't remove or water down anything they've claimed without asking.

When to stop: there's always more to draw out, so keep offering. Respect "skip" and "I don't know": move on, and come back to it later from a different angle. If the user wants to move on to a job, do; come back to refining at natural breaks (after a CV is saved, between applications), starting with what matters most for the roles they're targeting.`,
  },

  curate: {
    title: "Curating a job listing",
    use: "turning a new listing into a clean description and requirements, once per application",
    body: `${CURATE}

Curation is stored with the application and marked done, so never repeat it for an application that's already curated (get_application says so) unless the user asks you to or the listing has changed. If a link can't be read, ask the user to paste the description and call create_application with it.`,
  },

  gaps: {
    title: "Closing gaps between a job and the profile",
    use: "finding evidence for the job's requirements before writing",
    body: `get_application lists each requirement as proven, weak, gap or not claimed, with the achievements behind it.
- Go through the gaps one question at a time, must-haves first: "Have you done anything with X, even briefly, in another role, a course or a side project?" Adjacent work counts.
- If they have: draw out the full story as the refine guide describes (their part, scale, result), record it once it's complete, worded strongly, with update_profile, then link it to the requirement with link_requirements.
- If they haven't: call mark_not_claimed, so no CV ever claims it.
- For weak ones, ask for a figure or a concrete example that would prove them.
- If a link is wrong (the achievement doesn't really show the requirement), fix it with link_requirements.
Don't hold the CV up for nice-to-haves: once the must-haves are settled, offer to draft.`,
  },

  ambition: {
    title: "Ambition levels",
    use: "agreeing a level with the user and writing and rating to it",
    body: `The user decides, per application, how far the CV goes beyond their profile. Write to the application's level, never below it and never above it unless the user asks.

Agreeing the level: get_application shows it (Elevated unless the user chose another). The user may already have chosen it on the application's CV tab. If they haven't said, tell them the current level and offer the four in one line. If they pick another, set it with update_application. Changing the level after a CV exists means rewriting it with save_cv, not patching lines.

Calibrate to the role before writing at Polished or above: sketch, for yourself, the top candidate for this job. What scale do they work at (users, revenue, clients, team size)? What seniority markers do they show (strategy, standards across teams, hiring, external stakeholders)? What results would their CV quote? The levels are measured as how much of the gap between the user's profile and that candidate the CV closes. A user who is already close to the role still gets written up to the candidate.

${AMBITION.map((a) => `- ${a.level} ${a.name}: ${a.writer} Required: ${a.requires}`).join("\n")}

Rating: rate every bullet and the summary you write on the same 0–3 scale: 0 the profile's facts, reframed; 1 numbers pushed up or natural responsibilities added; 2 a clearly more senior version (inflated scope or numbers, initiatives led, adjacent skills); 3 model-candidate content (achievements, figures or responsibilities written for the ideal hire). Rate honestly: the CV tab highlights each line by its rating so the user can see what they'll need to back up in an interview. The server raises a rating it can see is too low, and flags underpowered lines (more than one level below the chosen level, or missing what the level requires).

Hard limits at every level, because they are checked and get offers withdrawn: never invent employers, job titles, dates, degrees or certifications, and never claim a requirement the user marked as not having.`,
  },

  writing: {
    title: "Writing the CV",
    use: "drafting a CV with save_cv",
    body: `The master profile is the complete factual record, worded strongly but for no job in particular. The CV is a new document that frames those facts in the best possible way for this one job. Never copy achievement text across: rewrite it around what this job values.

- Start from what the job values most (its responsibilities and must-haves). Choose and order bullets by relevance to it, not by the profile's order.
- Frame every bullet as strongly as the ambition level allows: the outcome or the scale first, then what the user did, with the strongest verb the level supports. Make it read like the work of someone already doing the target job.
- One tight line of about 15–25 words per bullet. Drop tool lists, internal names and detail this job doesn't care about.
- Combine related achievements into one bullet, or split a dense one, citing every source id.
- Use the job's vocabulary for the same thing, but write plainly: concrete nouns, numbers and outcomes, not adjectives. No filler like "spearheaded", "leveraged", "synergy", "results-driven", "passionate", "cutting-edge", "best-in-class", "dynamic" or "innovative", and no stacking several job keywords into one line.
- The headline names the target role. The summary is 2–3 sentences pitched at this role, not a recap of the latest job, with no first person. Order and name skills the way the job does, grouped in a few categories.
- Length: one page, always. It's a hard limit: save_cv and edit_cv refuse a CV that won't fit, even with the layout tightened, and say how many lines to cut. Plan for it: 3–5 bullets for the most relevant recent roles, 1–2 for older ones, each bullet one line, and leave out entries that don't help this job (they stay in the profile). Spend the space on what this job values most. Experience first, unless the user is a student or changing career, when projects or education can lead.
- Every bullet lists the achievement ids it is based on, and carries your 0–3 ambition rating (guide: ambition).

Ambition controls which facts may change, never whether to reframe: a Faithful bullet still reads as strongly framed for this job.

After save_cv, fix everything it flags before showing the user (guide: tuning), then point them to the CV tab.`,
  },

  tuning: {
    title: "Tuning a CV",
    use: "acting on the checks after save_cv or edit_cv, and on the user's change requests",
    body: `Use edit_cv for changes to particular lines, the headline or the summary; it needs the bullet and item ids from get_application (or the last save_cv result). Use save_cv to rewrite the whole CV: when the ambition level changes, when the user wants a different focus, or to reorder or swap which roles appear (edit_cv can't reorder). Give every new or rewritten line its sourceIds and a fresh, honest ambition rating.

One page is a hard limit. Every result says how full the page is ("room for about N more lines", or full). When it's full, every line you add needs a line cut. If a save or edit is refused for running over, cut at least the lines it names (the least relevant bullets first, then older roles, never the lines that cover must-haves) and try again.

Fixing what the checks flag (save_cv and edit_cv return these; fix them before showing the user):
- underpowered: the line is too timid for the chosen level. Rewrite it to the level's requirement: add the figure, widen the scope, state the business outcome or the leadership. Don't just swap in a stronger verb.
- uncoveredMustHaves (Bold only): add a line for each must-have the user's work touches, grown from their closest real work; ask the user about any it doesn't.
- copiedFromProfile: the line still reads like the profile. Reframe it for this job: outcome first, the job's words, a different structure. Combining it with a related achievement often helps.
- buzzwords: say it plainly, with a concrete noun or number in place of the filler word.
- aboveChosenLevel: a line goes further than the user asked for. Tone it down to the level, or tell the user and ask whether to keep it.
- warnings (numbers not in the sources, a not-claimed requirement mentioned): remove anything not claimed. Keep new numbers only if the level allows them, and mention them so the user can prepare to back them up.
- skillsToPrepare: skills kept on the CV that no achievement shows. Tell the user, or ask whether they have evidence to add to the profile.
- missingMustHaves and keyword coverage: work missing terms into a relevant existing line in the job's spelling, one term per line, or into the skills list. Never stack them.

Common requests:
- "Stronger", "punchier", "undersells me": raise the lines they mean within the level (outcome first, the figure, the scope). If they're at the level's ceiling, offer the next level up.
- "I can't defend this", "too much": tone those lines down and rate them lower, or offer a lower level for the whole CV.
- "Shorter": remove the least relevant bullets first, then whole older roles. Keep the lines that cover must-haves.
- "Add X" when the page is full: say what you'd cut to make room, cut it in the same edit, and tell the user.
- "Focus more on X": move lines about X up and make more of them; with many changes, rewrite with save_cv.
- "Change the summary or headline": edit_cv with the new text, and summaryAmbition for a new summary.
- A different level: update_application with the level, then rewrite with save_cv.

After each edit, read what comes back and fix anything still flagged. Then tell the user in a line or two what changed and point them to the CV tab, where each line is highlighted by its ambition.`,
  },

  tracking: {
    title: "Tracking the application",
    use: "recording applying, interviews, outcomes and notes",
    body: `Keep each application current with update_application:
- Stage: applied, interview, offer, rejected or withdrawn, with a one-sentence status_detail for the timeline.
- Interviews and deadlines: add an event with its date (an ISO date-time when there's a time), so it shows on the timeline.
- Notes: recruiter names, salary band, what was discussed, follow-ups.
Before an interview, offer to list the CV lines rated above Faithful (get_application shows each line's rating), so the user can prepare to back each one up.`,
  },
};

/** The text get_guide returns: one or more guides, or the list of topics. */
export function guideText(topics: GuideTopic[]) {
  if (!topics.length) return `CV Tailor guides. Call get_guide with a topic before starting that stage:\n${GUIDE_TOPICS.map((t) => `- ${t}: ${GUIDES[t].use}`).join("\n")}`;
  return topics.map((t) => `# ${GUIDES[t].title}\n\n${GUIDES[t].body}`).join("\n\n");
}
