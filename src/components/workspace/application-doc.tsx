"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AMBITION, ambitionName, type Ambition, type CvRating } from "@/lib/ambition";
import { api } from "@/lib/client/api";
import { emitRefresh, useRefresh } from "@/lib/client/bus";
import type { Requirement } from "@/lib/requirements";
import { CLOSED_STATUSES, TRACK, type AppStatus, type CvBullet, type CvDraft, type Job, type KeywordReport } from "@/lib/types";
import { toast, toastError } from "../toast";
import { Button, Spinner, Textarea, cx } from "../ui";
import { copyText } from "./activity-panel";
import type { AppTab } from "./application-view";
import { DocBar, DocBody, DocPanel, SectionLabel, Tabs } from "./doc";

type App = Required<Pick<Job, "events" | "notes" | "unclaimed">> & Job & { parsed: NonNullable<Job["parsed"]>; status: AppStatus; ambition: Ambition };
interface AppData {
  job: App;
  requirements: Requirement[];
  cv: CvDraft | null;
  report: KeywordReport | null;
  rating: CvRating | null;
}

export function ApplicationDocument({ id, tab, role, onTab }: { id: string; tab: AppTab; role: string; onTab: (tab: AppTab) => void }) {
  const [data, setData] = useState<AppData | null>(null);
  const [missing, setMissing] = useState(false);
  const load = useCallback(() => {
    api<AppData>(`/api/applications/${id}`)
      .then(setData)
      .catch(() => setMissing(true));
  }, [id]);
  useEffect(load, [load]);
  useRefresh(load);

  const title = data ? [data.job.parsed.title, data.job.parsed.company].filter(Boolean).join(" · ") : "Application";
  return (
    <DocPanel>
      <DocBar title={title}>
        <Tabs
          base={`/apps/${id}`}
          active={tab}
          onSelect={onTab}
          tabs={[
            { key: "match", label: "Match" },
            { key: "cv", label: "CV" },
            { key: "timeline", label: "Timeline" },
          ]}
        />
      </DocBar>
      {missing ? (
        <DocBody>
          <p className="text-muted">This application doesn&apos;t exist any more.</p>
        </DocBody>
      ) : !data ? (
        <DocBody>
          <div className="flex items-center gap-2 text-muted">
            <Spinner /> Loading…
          </div>
        </DocBody>
      ) : tab === "cv" ? (
        <CvTab data={data} reload={load} update={setData} role={role} />
      ) : tab === "timeline" ? (
        <TimelineTab data={data} reload={load} />
      ) : (
        <MatchTab data={data} reload={load} role={role} />
      )}
    </DocPanel>
  );
}

async function notClaimed(id: string, name: string, op: "add" | "remove", reload: () => void) {
  try {
    await api(`/api/applications/${id}`, { method: "PATCH", body: { notClaimed: { [op]: name } } });
    reload();
    emitRefresh();
  } catch (e) {
    toastError(e);
  }
}

async function markApplied(id: string, reload: () => void) {
  try {
    await api(`/api/applications/${id}`, { method: "PATCH", body: { status: "applied" } });
    toast("Marked as applied");
    reload();
    emitRefresh();
  } catch (e) {
    toastError(e);
  }
}

// ---------------------------------------------------------------------------

const DOT: Record<Requirement["state"], string> = {
  proven: "bg-accent",
  weak: "bg-[linear-gradient(90deg,#2443f2_50%,#c9d2ff_50%)]",
  gap: "border-2 border-warn bg-surface",
  unclaimed: "border-2 border-dashed border-[#8a909a]",
};
const PILL: Record<Requirement["state"], string> = {
  proven: "bg-accent-soft text-accent-strong",
  weak: "bg-paper text-ink-2",
  gap: "bg-warn-soft text-warn-ink",
  unclaimed: "bg-[#f2f3f5] text-muted",
};

function MatchTab({ data, reload, role }: { data: AppData; reload: () => void; role: string }) {
  const { job, requirements: reqs } = data;
  const [open, setOpen] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const backed = reqs.filter((r) => r.state === "proven" || r.state === "weak").length;
  const p = job.parsed;

  return (
    <DocBody>
      <section className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface px-6 py-5">
        <SectionLabel>The job · {job.url ? `read from ${job.source}` : "pasted description"}</SectionLabel>
        <p className="text-[22px] font-semibold tracking-tight">{p.title || "Untitled role"}</p>
        <p className="text-[15px] text-ink-2">{[p.company, p.location, p.seniority, p.yearsExperience].filter(Boolean).join(" · ")}</p>
        {p.summary && <p className="text-[15px] leading-relaxed text-ink-2">{p.summary}</p>}
        <div className="flex flex-wrap gap-4 text-sm">
          {job.url && (
            <a href={job.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Open the listing
            </a>
          )}
          <button type="button" className="text-accent hover:underline" onClick={() => setShowText(!showText)}>
            {showText ? "Hide" : "Show"} the full description
          </button>
        </div>
        {showText && <pre className="mt-1 max-h-96 overflow-auto rounded-lg bg-paper p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink-2">{job.rawText}</pre>}
      </section>

      <section className="overflow-hidden rounded-[14px] border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line-soft px-6 py-4">
          <p className="text-4xl leading-none font-semibold tracking-tight">
            {backed}
            <span className="text-[#8a909a]">/{reqs.length}</span>
          </p>
          <p className="max-w-[200px] text-[15px] leading-snug text-ink-2">requirements backed by your evidence</p>
          <span className="flex-1" />
          <Button variant="primary" onClick={() => copyText(draftPrompt(role, job.ambition, Boolean(job.cvId)), "Prompt copied")}>
            {job.cvId ? "Copy redraft prompt" : "Copy draft prompt"}
          </Button>
        </div>
        {reqs.length === 0 && <p className="px-6 py-5 text-sm text-muted">No specific requirements were found in this job.</p>}
        <ul>
          {reqs.map((r, i) => (
            <li key={r.name} className={cx(i > 0 && "border-t border-paper")}>
              <button
                type="button"
                aria-expanded={open === r.name}
                onClick={() => setOpen(open === r.name ? null : r.name)}
                className={cx("flex min-h-12 w-full items-center gap-3.5 px-6 py-3 text-left", open === r.name ? "bg-[#f2f4ff]" : "hover:bg-[#fafbfc]")}
              >
                <span aria-hidden="true" className={cx("size-3 shrink-0 rounded-full", DOT[r.state])} />
                <span className="flex-1 text-[15px] font-medium">{r.name}</span>
                <span className="font-mono text-[11px] tracking-[0.05em] text-faint uppercase">{r.weight}</span>
                <span className={cx("rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap", PILL[r.state])}>{r.note}</span>
              </button>
              {open === r.name && (
                <div className="flex flex-col gap-2 bg-[#f2f4ff] px-6 pb-4 pl-[50px]">
                  {r.proofs.map((pr) => (
                    <div key={pr.achievementId} className="rounded-lg border border-line-soft bg-surface px-3.5 py-2.5">
                      <p className="text-sm leading-relaxed">{pr.text}</p>
                      <p className="mt-0.5 text-xs text-muted">{pr.role}</p>
                    </div>
                  ))}
                  {r.state === "gap" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="flex-1 text-sm text-ink-2">Nothing in your profile covers this yet. Tell your chat about anything related, even if it was small.</p>
                      <Button size="sm" onClick={() => copyText(`For ${role} in CV Tailor: here's my experience with ${r.name}: `, "Prompt copied")}>
                        Copy prompt for your chat
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => notClaimed(job.id, r.name, "add", reload)}>
                        I don&apos;t have this
                      </Button>
                    </div>
                  )}
                  {r.state === "weak" && <p className="text-sm text-ink-2">{r.proofs.length ? "This proof has no number yet, so it reads as a claim rather than a result." : "It's in your skills list, but no achievement shows it."}</p>}
                  {r.state === "unclaimed" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="flex-1 text-sm text-ink-2">You said you don&apos;t have this, so the CV won&apos;t mention it.</p>
                      <Button size="sm" variant="ghost" onClick={() => notClaimed(job.id, r.name, "remove", reload)}>
                        Actually, I have this
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </DocBody>
  );
}

// ---------------------------------------------------------------------------

function CvTab({ data, reload, update, role }: { data: AppData; reload: () => void; update: (d: AppData) => void; role: string }) {
  const { cv, job, report } = data;
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [highlights, setHighlights] = useState(true);

  if (!cv) {
    return (
      <>
        <AmbitionPicker data={data} update={update} role={role} />
        <DocBody>
          <div className="flex flex-col items-start gap-3 rounded-xl border-[1.5px] border-dashed border-control px-6 py-7">
            <p className="text-lg font-semibold">No CV yet</p>
            <p className="text-[15px] leading-relaxed text-muted">
              Choose how ambitious this CV should be, then ask your chat to draft it. It picks and rewords the achievements from your master profile that fit this job, and rates every line it writes so you can see how far each one goes.
            </p>
            <Button variant="primary" onClick={() => copyText(draftPrompt(role, job.ambition, false), "Prompt copied")}>
              Copy prompt for your chat
            </Button>
          </div>
        </DocBody>
      </>
    );
  }

  async function save(mutate: (b: CvBullet) => void, bulletId: string) {
    const content = structuredClone(cv!.content);
    for (const s of content.sections) for (const i of s.items) for (const b of i.bullets) if (b.id === bulletId) mutate(b);
    try {
      await api(`/api/cvs/${cv!.id}`, { method: "PUT", body: { name: cv!.name, content } });
      setEditing(null);
      reload();
    } catch (e) {
      toastError(e);
    }
  }

  async function saveSummary(summary: string) {
    try {
      await api(`/api/cvs/${cv!.id}`, { method: "PUT", body: { name: cv!.name, content: { ...cv!.content, summary, summaryAmbition: undefined } } });
      setEditing(null);
      reload();
    } catch (e) {
      toastError(e);
    }
  }

  const h = cv.content.header;
  const contact = [h.email, h.phone, h.location, ...h.links.map((l) => l.url.replace(/^https?:\/\/(www\.)?/, ""))].filter(Boolean);
  const applied = ["applied", "interview", "offer"].includes(job.status) || CLOSED_STATUSES.includes(job.status);
  const rating = data.rating ?? { bullets: {}, summary: 0 as Ambition, skills: {} };
  const shown = cv.content.sections.flatMap((s) => (s.include ? s.items.filter((i) => i.include).flatMap((i) => i.bullets.filter((b) => b.include)) : []));
  const counts = AMBITION.map((a) => shown.filter((b) => (rating.bullets[b.id] ?? 0) === a.level).length);
  const mark = (level: Ambition) => ({ level, above: highlights && level > job.ambition, on: highlights });
  const pageEstimate = cv.content.sections.flatMap((s) => (s.include ? s.items.filter((i) => i.include).flatMap((i) => i.bullets.filter((b) => b.include)) : [])).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line-soft bg-sidebar px-7 py-3">
        <span className="text-sm text-ink-2">Edited {new Date(cv.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        {report && (
          <span className="text-sm text-muted">
            · {report.matched.length} of {report.matched.length + report.missing.length} job keywords · about {pageEstimate > 14 ? 2 : 1} page{pageEstimate > 14 ? "s" : ""}
          </span>
        )}
        <span className="flex-1" />
        <a href={`/api/cvs/${cv.id}/export?format=docx`} className="flex min-h-10 items-center rounded-[9px] border border-control bg-surface px-3.5 text-sm font-medium hover:border-muted">
          DOCX
        </a>
        <a href={`/api/cvs/${cv.id}/export?format=pdf`} className="flex min-h-10 items-center rounded-[9px] border border-control bg-surface px-3.5 text-sm font-medium hover:border-muted">
          PDF
        </a>
        {!applied && (
          <Button variant="primary" onClick={() => markApplied(job.id, reload)}>
            Mark as applied
          </Button>
        )}
      </div>
      <AmbitionPicker data={data} update={update} role={role} />
      <div className="flex flex-col items-center gap-4 bg-[#e4e7ec] px-4 py-7 sm:px-7">
        <AmbitionLegend counts={counts} chosen={job.ambition} highlights={highlights} onToggle={() => setHighlights(!highlights)} anyAbove={shown.some((b) => (rating.bullets[b.id] ?? 0) > job.ambition) || rating.summary > job.ambition} />
        <article aria-label="CV" className="cv-page w-full max-w-[720px] bg-white px-7 py-10 text-[13px] shadow-[0_1px_2px_rgba(14,17,22,0.08),0_8px_24px_rgba(14,17,22,0.08)] sm:px-[52px] sm:py-12">
          <h2 className="text-2xl font-bold tracking-tight">{h.name || "Your name"}</h2>
          {h.headline && <p className="mt-0.5 text-sm">{h.headline}</p>}
          {contact.length > 0 && <p className="mt-1 text-xs text-[#333]">{contact.join("  |  ")}</p>}

          <CvHeading>Summary</CvHeading>
          {editing === "summary" ? (
            <InlineEdit value={text} onChange={setText} onCancel={() => setEditing(null)} onSave={() => saveSummary(text)} />
          ) : (
            <button type="button" className="w-full rounded-sm text-left hover:bg-accent-soft" onClick={() => (setText(cv.content.summary), setEditing("summary"))}>
              {cv.content.summary ? <Rated {...mark(rating.summary)}>{cv.content.summary}</Rated> : <span className="text-faint">Add a summary</span>}
            </button>
          )}

          {cv.content.skills.length > 0 && (
            <>
              <CvHeading>Skills</CvHeading>
              {cv.content.skills.map((g, i) => (
                <p key={i} className="mb-0.5">
                  {g.category && <strong>{g.category}: </strong>}
                  {g.items.map((item, k) => (
                    <span key={item}>
                      {k > 0 && ", "}
                      <Rated {...mark(rating.skills[item] ?? 0)}>{item}</Rated>
                    </span>
                  ))}
                </p>
              ))}
            </>
          )}

          {cv.content.sections
            .filter((s) => s.include && s.items.some((i) => i.include))
            .map((s) => (
              <div key={s.id}>
                <CvHeading>{s.title}</CvHeading>
                {s.items
                  .filter((i) => i.include)
                  .map((it) => (
                    <div key={it.id} className="mb-2.5">
                      <div className="flex justify-between gap-4">
                        <p>
                          <strong>{it.title}</strong>
                          {it.organization && `, ${it.organization}`}
                        </p>
                        <p className="shrink-0">{it.dates}</p>
                      </div>
                      <ul className="mt-0.5 flex flex-col gap-px">
                        {it.bullets
                          .filter((b) => b.include)
                          .map((b) => (
                            <li key={b.id} className="flex gap-2 pl-1">
                              <span aria-hidden="true">•</span>
                              {editing === b.id ? (
                                <InlineEdit
                                  value={text}
                                  onChange={setText}
                                  onCancel={() => setEditing(null)}
                                  onSave={() => save((x) => ((x.text = text), (x.warning = undefined), (x.ambition = undefined)), b.id)}
                                  onRemove={() => save((x) => (x.include = false), b.id)}
                                />
                              ) : (
                                <button
                                  type="button"
                                  title={[lineTitle(rating.bullets[b.id] ?? 0, job.ambition), b.warning, "Click to edit"].filter(Boolean).join("\n")}
                                  onClick={() => (setText(b.text), setEditing(b.id))}
                                  className={cx("flex-1 rounded-sm text-left hover:bg-accent-soft", !highlights && b.warning && "underline decoration-warn decoration-wavy underline-offset-[3px]")}
                                >
                                  <Rated {...mark(rating.bullets[b.id] ?? 0)}>{b.text}</Rated>
                                </button>
                              )}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
              </div>
            ))}
        </article>
      </div>
      <p className="px-7 pb-6 text-center text-[13px] text-muted">Click any line to edit it, or ask your chat for changes like “make it shorter” or “tone down the Bold lines”. Highlights are never included in the PDF or DOCX.</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ambition: the level the user picks for this application, and how each CV line is rated.

const HL: Record<Ambition, string> = { 0: "", 1: "bg-[#e3e9ff]", 2: "bg-[#ffecb0]", 3: "bg-[#ffd4cf]" };
const SWATCH: Record<Ambition, string> = { 0: "bg-white ring-1 ring-[#b9bfc8]", 1: "bg-[#c9d4ff]", 2: "bg-[#ffd966]", 3: "bg-[#ff9f94]" };

const draftPrompt = (role: string, level: Ambition, redraft: boolean) => `${redraft ? "Redraft" : "Draft"} my CV for ${role} in CV Tailor at the ${ambitionName(level)} ambition level.`;

function lineTitle(level: Ambition, chosen: Ambition) {
  return `${ambitionName(level)}: ${AMBITION[level].line}${level > chosen ? ` (above the ${ambitionName(chosen)} level you chose)` : ""}`;
}

function Rated({ level, above, on, children }: { level: Ambition; above: boolean; on: boolean; children: React.ReactNode }) {
  if (!on || (!level && !above)) return <>{children}</>;
  return <span className={cx("rounded-[3px] px-[2px] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]", HL[level], above && "outline-[1.5px] outline-offset-1 outline-[#b42318] outline-dashed")}>{children}</span>;
}

function AmbitionPicker({ data, update, role }: { data: AppData; update: (d: AppData) => void; role: string }) {
  const { job, cv } = data;
  const level = job.ambition;
  const stale = cv && cv.ambition !== undefined && cv.ambition !== level;
  const latest = useRef(0);

  // It's only a setting: show the new level at once and save in the background,
  // putting the old one back if the save fails.
  async function choose(next: Ambition) {
    if (next === level) return;
    const request = ++latest.current;
    update({ ...data, job: { ...job, ambition: next } });
    try {
      await api(`/api/applications/${job.id}`, { method: "PATCH", body: { ambition: next } });
    } catch (e) {
      if (request === latest.current) update({ ...data, job: { ...job, ambition: level } });
      toastError(e);
    }
  }

  return (
    <section aria-labelledby="ambition-h" className="flex flex-col gap-2.5 border-b border-line-soft bg-surface px-7 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <h2 id="ambition-h" className="text-sm font-semibold">
          Ambition
        </h2>
        <div role="radiogroup" aria-labelledby="ambition-h" className="flex flex-wrap gap-1 rounded-[10px] bg-paper p-1">
          {AMBITION.map((a) => (
            <button
              key={a.level}
              type="button"
              role="radio"
              aria-checked={a.level === level}
              onClick={() => choose(a.level)}
              className={cx("flex min-h-9 items-center gap-2 rounded-[7px] px-3 text-sm font-medium", a.level === level ? "bg-surface text-ink shadow-[0_1px_2px_rgba(14,17,22,0.12)]" : "text-ink-2 hover:text-ink")}
            >
              <span aria-hidden="true" className={cx("size-2.5 rounded-full", SWATCH[a.level])} />
              {a.name}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {cv && (
          <Button size="sm" variant={stale ? "primary" : "ghost"} onClick={() => copyText(draftPrompt(role, level, true), "Prompt copied")}>
            Copy redraft prompt
          </Button>
        )}
      </div>
      <p className="text-sm leading-relaxed text-ink-2">
        {AMBITION[level].setting}
        {stale && <span className="text-warn-ink"> This CV was written at {ambitionName(cv.ambition!)}, so ask your chat to redraft it.</span>}
      </p>
    </section>
  );
}

function AmbitionLegend({ counts, chosen, highlights, onToggle, anyAbove }: { counts: number[]; chosen: Ambition; highlights: boolean; onToggle: () => void; anyAbove: boolean }) {
  return (
    <section aria-label="Ambition legend" className="w-full max-w-[720px] rounded-xl bg-surface px-5 py-3.5 shadow-[0_1px_2px_rgba(14,17,22,0.06)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="flex-1 text-[13px] font-medium text-ink-2">Each line is highlighted by how far it goes beyond your profile</p>
        <button type="button" role="switch" aria-checked={highlights} onClick={onToggle} className="min-h-8 text-[13px] font-medium text-accent">
          {highlights ? "Hide highlights" : "Show highlights"}
        </button>
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {AMBITION.map((a) => (
          <li key={a.level} className={cx("flex items-start gap-2 text-[13px] leading-snug", a.level > chosen && !counts[a.level] && "opacity-50")}>
            <span aria-hidden="true" className={cx("mt-[3px] size-3 shrink-0 rounded-[3px]", SWATCH[a.level])} />
            <span>
              <span className="font-semibold">{a.name}</span> <span className="font-mono text-xs text-muted">{counts[a.level]}</span>
              <span className="block text-muted">{a.line}</span>
            </span>
          </li>
        ))}
      </ul>
      {anyAbove && highlights && (
        <p className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
          <span aria-hidden="true" className="h-3 w-5 shrink-0 rounded-[3px] outline-[1.5px] outline-[#b42318] outline-dashed" />
          Dashed outline: above the {ambitionName(chosen)} level you chose for this application
        </p>
      )}
    </section>
  );
}

function CvHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-4 mb-1.5 border-b border-[#222] pb-[3px] text-[12.5px] font-bold tracking-[0.06em] uppercase">{children}</h3>;
}

function InlineEdit({ value, onChange, onSave, onCancel, onRemove }: { value: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void; onRemove?: () => void }) {
  return (
    <div className="my-1 flex flex-1 flex-col gap-2 font-sans">
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} autoFocus className="text-[13px]" />
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={onSave}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {onRemove && (
          <Button size="sm" variant="danger" onClick={onRemove} className="ml-auto">
            Remove line
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const fmtDate = (iso: string, withTime = false) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });

function TimelineTab({ data, reload }: { data: AppData; reload: () => void }) {
  const router = useRouter();
  const { job } = data;
  const [notes, setNotes] = useState(job.notes);
  const [now] = useState(() => new Date().toISOString());
  const closed = CLOSED_STATUSES.includes(job.status);
  const reached = TRACK.findIndex((t) => t.status === (job.reached ?? job.status));
  const current = TRACK.findIndex((t) => t.status === job.status);
  const events = [...job.events].sort((a, b) => b.at.localeCompare(a.at));
  const upcoming = job.events.filter((e) => e.at > now).sort((a, b) => a.at.localeCompare(b.at))[0];

  const stageDate = (s: AppStatus) => {
    const titles: Record<string, string[]> = { saved: ["Saved"], cv: ["CV drafted"], applied: ["Applied"], interview: ["Interview"], offer: ["Offer received"] };
    const e = job.events.find((x) => titles[s]?.includes(x.title));
    return e ? fmtDate(e.at) : "";
  };

  async function patch(body: { notes?: string; status?: AppStatus }) {
    try {
      await api(`/api/applications/${job.id}`, { method: "PATCH", body });
      reload();
      emitRefresh();
    } catch (e) {
      toastError(e);
    }
  }

  async function del() {
    if (!confirm("Delete this application, its CV and its conversation? Your master profile isn't affected.")) return;
    try {
      await api(`/api/applications/${job.id}`, { method: "DELETE" });
      emitRefresh();
      toast("Application deleted");
      router.push("/");
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <DocBody>
      <section aria-label="Stage" className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface px-6 py-5">
        <ol className="grid grid-cols-5 gap-1.5">
          {TRACK.map((t, i) => (
            <li key={t.status} aria-current={i === current ? "step" : undefined} className="flex flex-col gap-2">
              <span aria-hidden="true" className={cx("h-1.5 rounded-full", i < current || (closed && i <= reached) ? (closed ? "bg-[#8a909a]" : "bg-accent") : i === current ? "bg-ink" : "bg-line")} />
              <span className={cx("text-sm", i <= Math.max(current, reached) ? "font-semibold" : "text-muted")}>{t.label}</span>
              <span className="font-mono text-xs text-muted">{stageDate(t.status) || " "}</span>
            </li>
          ))}
        </ol>
        {closed && <p className="rounded-xl bg-paper px-4 py-3 text-[15px] font-medium">{job.status === "rejected" ? "Not progressed." : "You withdrew."} It&apos;s under Closed in the sidebar.</p>}
        {upcoming && !closed && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-ink px-4 py-3.5 text-white">
            <span className="font-mono text-[11px] tracking-[0.08em] text-[#b8bec8] uppercase">Next</span>
            <span className="text-[15px] font-semibold">
              {upcoming.title} · {fmtDate(upcoming.at, true)}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted">{closed ? "Reopen as" : "Update"}</span>
          {(closed ? (["applied", "interview"] as AppStatus[]) : (["applied", "interview", "offer", "rejected", "withdrawn"] as AppStatus[]))
            .filter((s) => s !== job.status)
            .map((s) => (
              <button key={s} type="button" onClick={() => patch({ status: s })} className="min-h-9 rounded-full border border-control bg-surface px-3 text-sm hover:border-muted">
                {{ applied: "Applied", interview: "Interview", offer: "Got an offer", rejected: "Not progressed", withdrawn: "I withdrew", saved: "", cv: "" }[s]}
              </button>
            ))}
        </div>
      </section>

      <section aria-labelledby="tl-h" className="rounded-[14px] border border-line bg-surface px-6 py-5">
        <h2 id="tl-h" className="mb-3 text-base font-semibold">
          Timeline
        </h2>
        <ol>
          {events.map((e, i) => {
            const future = e.at > now;
            return (
              <li key={e.id} className="grid grid-cols-[84px_20px_minmax(0,1fr)] gap-x-3">
                <span className="pt-px font-mono text-[13px] text-muted">{fmtDate(e.at)}</span>
                <span aria-hidden="true" className="flex flex-col items-center">
                  <span className={cx("mt-1 size-3 shrink-0 rounded-full", future ? "border-2 border-ink bg-hl" : "bg-accent")} />
                  <span className={cx("mt-1 w-0.5 flex-1", i === events.length - 1 ? "bg-transparent" : "bg-line")} />
                </span>
                <div className="flex flex-col gap-1 pb-5">
                  <p className="text-[15px] font-semibold">{e.title}</p>
                  {e.detail && <p className="text-sm leading-relaxed text-muted">{e.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="text-[13px] text-muted">Tell your chat what happens (“they invited me to interview on Tuesday at 2pm”) and it&apos;ll keep this up to date.</p>
      </section>

      <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-6 py-5">
        <h2 className="text-base font-semibold">Notes</h2>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== job.notes && patch({ notes })} placeholder="Recruiter name, salary band, team details…" className="min-h-20" />
      </section>

      <div className="px-1">
        <Button variant="danger" size="sm" onClick={del}>
          Delete this application
        </Button>
      </div>
    </DocBody>
  );
}
