"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AMBITION, ambitionName, type Ambition, type CvRating } from "@/lib/ambition";
import type { AtsReport } from "@/lib/ats";
import { api } from "@/lib/client/api";
import { emitRefresh } from "@/lib/client/bus";
import { capitalize } from "@/lib/format";
import type { PageFit } from "@/lib/export";
import type { Requirement } from "@/lib/requirements";
import { CLOSED_STATUSES, TRACK, type AppStatus, type CvBullet, type CvContent, type CvDraft, type Job, type KeywordReport } from "@/lib/types";
import { toast, toastError } from "../toast";
import { Button, Textarea, cx } from "../ui";
import { copyText } from "./activity-panel";
import type { AppTab } from "./application-view";
import { DocBody, SectionLabel } from "./doc";

type App = Required<Pick<Job, "events" | "notes" | "unclaimed">> & Job & { parsed: NonNullable<Job["parsed"]>; status: AppStatus; ambition: Ambition };
export interface AppData {
  job: App;
  requirements: Requirement[];
  cv: CvDraft | null;
  report: KeywordReport | null;
  ats: AtsReport | null;
  rating: CvRating | null;
  page: PageFit | null;
  versions: { latest: number; sent: number | null } | null;
}

/** An earlier version being looked at instead of the latest. */
export interface ViewedVersion {
  n: number;
  at: string;
  summary: string;
  content: CvContent;
  rating: CvRating;
}

/** The CV tab's shared state: which version is shown, and the lines picked for the chat. */
export interface CvState {
  viewed: ViewedVersion | null;
  selected: string[];
  onSelect: (lineId: string) => void;
  editing: string | null;
  onEdit: (lineId: string | null) => void;
  onBack: () => void;
  onRestore: (n: number) => void;
}

/** The summary's id when it's picked like a line. */
export const SUMMARY = "summary";

export function ApplicationDocument({ data, tab, role, reload, update, onTab, cvState }: { data: AppData; tab: AppTab; role: string; reload: () => void; update: (d: AppData) => void; onTab: (tab: AppTab) => void; cvState: CvState }) {
  if (tab === "cv") return <CvTab data={data} reload={reload} update={update} role={role} state={cvState} />;
  if (tab === "timeline") return <TimelineTab data={data} reload={reload} />;
  return <MatchTab data={data} reload={reload} role={role} onTab={onTab} />;
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

export async function markApplied(id: string, reload: () => void) {
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

function MatchTab({ data, reload, role, onTab }: { data: AppData; reload: () => void; role: string; onTab: (tab: AppTab) => void }) {
  const { job, requirements: reqs } = data;
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const backed = reqs.filter((r) => r.state === "proven" || r.state === "weak").length;
  const p = job.parsed;
  const curated = Boolean(job.curatedAt);
  // The rest of the listing, read as a continuation of the summary: the curated description, or the page text until then.
  const fullText = (curated ? job.description : job.rawText)?.trim() ?? "";

  return (
    <DocBody>
      {!curated && (
        <section className="flex flex-col items-start gap-2.5 rounded-[14px] border border-warn bg-warn-soft px-6 py-5">
          <p className="text-[15px] font-semibold text-warn-ink">Your chat hasn&apos;t read this listing yet</p>
          <p className="text-sm leading-relaxed text-ink-2">
            The requirements below are a rough keyword guess from the page text. Ask your chat to read the listing: it cuts it down to the job description and picks out what the job asks for, once.
          </p>
          <Button size="sm" onClick={() => copyText(`Read the job listing for ${role} in CV Tailor and pick out what it asks for.`, "Prompt copied")}>
            Copy prompt for your chat
          </Button>
        </section>
      )}
      <section className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface px-6 py-5">
        <SectionLabel>The job · {job.url && job.source !== "Pasted" ? `read from ${job.source}` : "pasted description"}</SectionLabel>
        <p className="text-[22px] font-semibold tracking-tight">{p.title || "Untitled role"}</p>
        <p className="text-[15px] text-ink-2">{[p.company, p.location, p.seniority, p.salary, p.yearsExperience].filter(Boolean).join(" · ")}</p>
        {p.summary && <p className="text-[15px] leading-relaxed text-ink-2">{p.summary}</p>}
        {expanded && <JobText text={fullText} />}
        <div className="flex flex-wrap gap-4 text-sm">
          {fullText && (
            <button type="button" aria-expanded={expanded} className="text-accent hover:underline" onClick={() => setExpanded(!expanded)}>
              {expanded ? "Show less" : curated ? "Show full description" : "Show the page text"}
            </button>
          )}
          {job.url && (
            <a href={job.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Open the listing
            </a>
          )}
          {curated && <span className="text-muted">Curated by your chat {new Date(job.curatedAt!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
        </div>
      </section>

      <section className="overflow-hidden rounded-[14px] border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line-soft px-6 py-4">
          <p className="text-4xl leading-none font-semibold tracking-tight">
            {backed}
            <span className="text-[#8a909a]">/{reqs.length}</span>
          </p>
          <p className="max-w-[200px] text-[15px] leading-snug text-ink-2">requirements backed by your evidence</p>
          <span className="flex-1" />
          {curated && (
            <Button variant="primary" onClick={() => onTab("cv")}>
              {job.cvId ? "Go to CV" : "Choose ambition and draft"}
            </Button>
          )}
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
                <span className="flex-1 text-[15px] font-medium">{capitalize(r.name)}</span>
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

/**
 * A job description in the same style as the summary above it: blank-line separated
 * blocks, "- " (or •, *) lines as bullet lists, and short lines before them as headings.
 */
function JobText({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean));
  const bullet = /^[-•*]\s+/;
  return (
    <div className="flex flex-col gap-2.5 text-[15px] leading-relaxed text-ink-2">
      {blocks.flatMap((lines, i) => {
        const out: React.ReactNode[] = [];
        let items: string[] = [];
        const flush = (k: string) => {
          if (items.length) out.push(<ul key={k} className="ml-5 list-disc space-y-1">{items.map((t, j) => <li key={j}>{t}</li>)}</ul>);
          items = [];
        };
        lines.forEach((line, j) => {
          if (bullet.test(line)) return void items.push(line.replace(bullet, ""));
          flush(`${i}-${j}-list`);
          const heading = line.split(/\s+/).length <= 5 && !/[.:,;]$/.test(line) && (lines.length > 1 || bullet.test(blocks[i + 1]?.[0] ?? ""));
          out.push(heading ? <p key={`${i}-${j}`} className="font-semibold text-ink">{line}</p> : <p key={`${i}-${j}`}>{line}</p>);
        });
        flush(`${i}-end`);
        return out;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The CV tab: the CV, its legend, the ATS score and export. Every line is highlighted by
// its ambition; click lines to pick them, and the activity panel offers prompts for them.

const shownBullets = (c: CvContent) => c.sections.flatMap((s) => (s.include ? s.items.filter((i) => i.include).flatMap((i) => i.bullets.filter((b) => b.include)) : []));

function CvTab({ data, reload, update, role, state }: { data: AppData; reload: () => void; update: (d: AppData) => void; role: string; state: CvState }) {
  const { cv } = data;
  const [text, setText] = useState("");
  const [editingFor, setEditingFor] = useState<string | null>(null);
  // Dragging a line within its role: the line being moved, and where it would land.
  const [drag, setDrag] = useState<{ itemId: string; id: string } | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);

  if (!cv) return <DraftCard data={data} update={update} role={role} />;

  const viewed = state.viewed;
  const content = viewed?.content ?? cv.content;
  const rating = viewed?.rating ?? data.rating ?? { bullets: {}, summary: 0 as Ambition, skills: {} };
  // The edit box starts from the line's text each time a line is opened for editing.
  const editing = viewed ? null : state.editing;
  if (editing !== editingFor) {
    setEditingFor(editing);
    setText(editing === SUMMARY ? cv.content.summary : (shownBullets(cv.content).find((b) => b.id === editing)?.text ?? ""));
  }

  async function saveContent(next: CvContent) {
    try {
      await api(`/api/cvs/${cv!.id}`, { method: "PUT", body: { name: cv!.name, content: next } });
      state.onEdit(null);
      reload();
      emitRefresh();
    } catch (e) {
      toastError(e);
    }
  }
  function saveBullet(bulletId: string, mutate: (b: CvBullet) => void) {
    const next = structuredClone(cv!.content);
    for (const s of next.sections) for (const i of s.items) for (const b of i.bullets) if (b.id === bulletId) mutate(b);
    return saveContent(next);
  }
  /** Move a line next to another in the same role, showing it at once and saving it as a new version. */
  function moveBullet(itemId: string, id: string, target: string, after: boolean) {
    if (id === target) return;
    const next = structuredClone(cv!.content);
    for (const s of next.sections)
      for (const it of s.items) {
        if (it.id !== itemId) continue;
        const [moved] = it.bullets.splice(it.bullets.findIndex((b) => b.id === id), 1);
        it.bullets.splice(it.bullets.findIndex((b) => b.id === target) + (after ? 1 : 0), 0, moved);
      }
    if (JSON.stringify(next) === JSON.stringify(cv!.content)) return;
    update({ ...data, cv: { ...cv!, content: next } });
    return saveContent(next);
  }

  const h = content.header;
  const contact = [h.email, h.phone, h.location, ...h.links.map((l) => l.url.replace(/^https?:\/\/(www\.)?/, ""))].filter(Boolean);
  const lines = shownBullets(content);
  const counts = AMBITION.map((a) => lines.filter((b) => (rating.bullets[b.id] ?? 0) === a.level).length + (content.summary && rating.summary === a.level ? 1 : 0));
  const picked = (id: string) => !viewed && state.selected.includes(id);

  return (
    <div className="flex min-h-full flex-col items-center bg-[#e4e7ec] px-4 pb-10 sm:px-7">
      <div className="sticky top-0 z-10 flex w-full justify-center bg-[#e4e7ec] py-3">
        {viewed ? (
          <ViewingBanner version={viewed} onBack={state.onBack} onRestore={() => state.onRestore(viewed.n)} />
        ) : (
          <CvStrip counts={counts} ats={data.ats} cvId={cv.id} />
        )}
      </div>
      <article aria-label="CV" className="cv-page w-full max-w-[720px] bg-white px-7 py-10 text-[13px] shadow-[0_1px_2px_rgba(14,17,22,0.08),0_8px_24px_rgba(14,17,22,0.08)] sm:px-[52px] sm:py-12">
        <h2 className="text-2xl font-bold tracking-tight">{h.name || "Your name"}</h2>
        {h.headline && <p className="mt-0.5 text-sm">{h.headline}</p>}
        {contact.length > 0 && <p className="mt-1 text-xs text-[#333]">{contact.join("  |  ")}</p>}

        <CvHeading>Summary</CvHeading>
        {editing === SUMMARY ? (
          <InlineEdit value={text} onChange={setText} onCancel={() => state.onEdit(null)} onSave={() => saveContent({ ...cv.content, summary: text, summaryAmbition: undefined })} />
        ) : content.summary ? (
          <Line level={rating.summary} picked={picked(SUMMARY)} disabled={!!viewed} onPick={() => state.onSelect(SUMMARY)}>
            {content.summary}
          </Line>
        ) : (
          <p className="text-faint">No summary</p>
        )}

        {content.skills.length > 0 && (
          <>
            <CvHeading>Skills</CvHeading>
            {content.skills.map((g, i) => (
              <p key={i} className="mb-0.5">
                {g.category && <strong>{g.category}: </strong>}
                {g.items.map((item, k) => (
                  <span key={item}>
                    {k > 0 && ", "}
                    <Rated level={rating.skills[item] ?? 0}>{item}</Rated>
                  </span>
                ))}
              </p>
            ))}
          </>
        )}

        {content.sections
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
                        .map((b, k, shown) => (
                          <li
                            key={b.id}
                            className={cx("group relative flex gap-2 pl-1", drag?.id === b.id && "opacity-40")}
                            onDragOver={(e) => {
                              if (drag?.itemId !== it.id) return;
                              e.preventDefault();
                              const r = e.currentTarget.getBoundingClientRect();
                              const after = e.clientY > r.top + r.height / 2;
                              if (drop?.id !== b.id || drop.after !== after) setDrop({ id: b.id, after });
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (drag && drop) moveBullet(it.id, drag.id, drop.id, drop.after);
                              setDrag(null);
                              setDrop(null);
                            }}
                          >
                            {drop?.id === b.id && drag?.id !== b.id && <span aria-hidden="true" className={cx("pointer-events-none absolute inset-x-0 h-0.5 rounded-sm bg-accent", drop.after ? "-bottom-px" : "-top-px")} />}
                            {!viewed && editing !== b.id && shown.length > 1 && (
                              <MoveHandle
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", b.id);
                                  const li = e.currentTarget.closest("li");
                                  if (li) e.dataTransfer.setDragImage(li, 24, 10);
                                  setDrag({ itemId: it.id, id: b.id });
                                }}
                                onDragEnd={() => {
                                  setDrag(null);
                                  setDrop(null);
                                }}
                                onUp={k > 0 ? () => moveBullet(it.id, b.id, shown[k - 1].id, false) : undefined}
                                onDown={k < shown.length - 1 ? () => moveBullet(it.id, b.id, shown[k + 1].id, true) : undefined}
                              />
                            )}
                            <span aria-hidden="true">•</span>
                            {editing === b.id ? (
                              <InlineEdit
                                value={text}
                                onChange={setText}
                                onCancel={() => state.onEdit(null)}
                                onSave={() => saveBullet(b.id, (x) => ((x.text = text), (x.warning = undefined), (x.ambition = undefined)))}
                                onRemove={() => saveBullet(b.id, (x) => (x.include = false))}
                              />
                            ) : (
                              <Line level={rating.bullets[b.id] ?? 0} picked={picked(b.id)} disabled={!!viewed} warning={b.warning} onPick={() => state.onSelect(b.id)}>
                                {b.text}
                              </Line>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
            </div>
          ))}
      </article>
      <p className="mt-4 text-center text-[13px] text-muted">
        {viewed ? "This is how the CV looked then. Restore it to make it the latest version again." : "Click lines to pick them, and the panel on the right suggests prompts for your chat. Drag the handle beside a line to move it. Highlights are never included in the PDF or DOCX."}
      </p>
    </div>
  );
}

// One colour per ambition level, shared by the line highlights and the legend.
const HL: Record<Ambition, string> = { 0: "", 1: "bg-[#e3e9ff]", 2: "bg-[#ffecb0]", 3: "bg-[#ffd4cf]" };
const SWATCH: Record<Ambition, string> = { 0: "bg-white ring-1 ring-[#b9bfc8]", 1: "bg-[#c9d4ff]", 2: "bg-[#ffd966]", 3: "bg-[#ff9f94]" };

export const draftPrompt = (role: string, level: Ambition, redraft: boolean) => `${redraft ? "Redraft" : "Draft"} my CV for ${role} in CV Tailor at the ${ambitionName(level)} ambition level.`;

function Rated({ level, children }: { level: Ambition; children: React.ReactNode }) {
  if (!level) return <>{children}</>;
  return <span className={cx("rounded-[3px] px-[2px] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]", HL[level])}>{children}</span>;
}

/** A CV line you can pick for the chat. */
function Line({ level, picked, disabled, warning, onPick, children }: { level: Ambition; picked: boolean; disabled: boolean; warning?: string; onPick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={picked}
      disabled={disabled}
      title={[`${ambitionName(level)}: ${AMBITION[level].line}`, warning].filter(Boolean).join("\n")}
      onClick={onPick}
      className={cx("flex-1 rounded-[3px] text-left disabled:cursor-default", picked ? "outline-2 outline-offset-2 outline-accent" : !disabled && "hover:outline hover:outline-1 hover:outline-offset-2 hover:outline-[#9fb0f5]")}
    >
      <Rated level={level}>{children}</Rated>
    </button>
  );
}

/** The grip beside a CV line: drag it to move the line, or focus it and use the up and down arrows. */
function MoveHandle({ onDragStart, onDragEnd, onUp, onDown }: { onDragStart: (e: React.DragEvent<HTMLButtonElement>) => void; onDragEnd: () => void; onUp?: () => void; onDown?: () => void }) {
  return (
    <button
      type="button"
      draggable
      aria-label="Move line: drag it, or press the up or down arrow"
      aria-keyshortcuts="ArrowUp ArrowDown"
      title="Drag to move"
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={(e) => {
        const move = e.key === "ArrowUp" ? onUp : e.key === "ArrowDown" ? onDown : undefined;
        if (!move) return;
        e.preventDefault();
        move();
      }}
      className="absolute top-px -left-6 grid h-[18px] w-5 cursor-grab place-items-center rounded text-[#8a909a] opacity-0 group-hover:opacity-100 hover:bg-paper hover:text-ink focus-visible:opacity-100 active:cursor-grabbing"
    >
      <svg aria-hidden="true" width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
        <circle cx="3" cy="3" r="1.3" />
        <circle cx="7" cy="3" r="1.3" />
        <circle cx="3" cy="7" r="1.3" />
        <circle cx="7" cy="7" r="1.3" />
        <circle cx="3" cy="11" r="1.3" />
        <circle cx="7" cy="11" r="1.3" />
      </svg>
    </button>
  );
}

/** Choose how far the CV may stretch the profile. Saved in the background; the old level comes back if that fails. */
export async function chooseAmbition(data: AppData, update: (d: AppData) => void, next: Ambition) {
  const level = data.job.ambition;
  if (next === level) return;
  update({ ...data, job: { ...data.job, ambition: next } });
  try {
    await api(`/api/applications/${data.job.id}`, { method: "PATCH", body: { ambition: next } });
  } catch (e) {
    update({ ...data, job: { ...data.job, ambition: level } });
    toastError(e);
  }
}

/** Before there's a CV: pick the ambition, then copy the prompt that asks the chat to draft it. */
function DraftCard({ data, update, role }: { data: AppData; update: (d: AppData) => void; role: string }) {
  const level = data.job.ambition;
  return (
    <DocBody>
      <section className="flex flex-col gap-4 rounded-2xl bg-surface px-7 py-7 shadow-[0_1px_2px_rgba(14,17,22,0.08),0_8px_24px_rgba(14,17,22,0.08)]">
        <h2 className="text-[22px] font-semibold tracking-tight">Draft your CV for this job</h2>
        <p className="text-[15px] leading-relaxed text-ink-2">Pick how far the CV may stretch your profile. Your chat writes to that level and rates every line, so you can see what to prepare for in an interview.</p>
        <div role="radiogroup" aria-label="Ambition" className="flex flex-col gap-2">
          {AMBITION.map((a) => (
            <button
              key={a.level}
              type="button"
              role="radio"
              aria-checked={a.level === level}
              onClick={() => chooseAmbition(data, update, a.level)}
              className={cx("flex items-start gap-3 rounded-xl border-[1.5px] px-4 py-3 text-left", a.level === level ? "border-accent bg-accent-soft" : "border-line hover:border-control")}
            >
              <span aria-hidden="true" className={cx("mt-1 size-4 shrink-0 rounded", SWATCH[a.level])} />
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold">{a.name}</span>
                <span className="text-sm text-muted">{a.line}</span>
              </span>
            </button>
          ))}
        </div>
        <Button variant="primary" className="h-12 text-[15px]" onClick={() => copyText(draftPrompt(role, level, false), "Prompt copied")}>
          Copy the prompt for your chat
        </Button>
        <p className="text-[13px] leading-relaxed text-muted">Paste it into your chat. The draft appears here as version 1, and in Activity on the right.</p>
      </section>
    </DocBody>
  );
}

/** The bar above the CV: what each highlight colour means, the ATS score, and export. */
function CvStrip({ counts, ats, cvId }: { counts: number[]; ats: AtsReport | null; cvId: string }) {
  const [open, setOpen] = useState<"ats" | "export" | null>(null);
  // The ATS breakdown and export menu close on Escape or a click elsewhere.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const band = !ats ? "" : ats.score >= 85 ? "bg-[#dcf2e4] text-[#14593a]" : ats.score >= 70 ? "bg-[#fff0c2] text-[#6b4300]" : "bg-danger-soft text-[#8a1c10]";
  return (
    <div ref={ref} className="relative flex w-full max-w-[720px] flex-wrap items-center gap-1 rounded-xl bg-surface p-1.5 shadow-[0_1px_2px_rgba(14,17,22,0.08),0_6px_20px_rgba(14,17,22,0.12)]">
      <ul aria-label="Highlight colours" className="flex flex-1 flex-wrap items-center gap-x-[18px] gap-y-1 px-2">
        {AMBITION.map((a) => (
          <li key={a.level} title={a.line} className="flex items-center gap-[7px] text-[13px] whitespace-nowrap">
            <span aria-hidden="true" className={cx("size-3.5 rounded", SWATCH[a.level])} />
            <span className="font-medium">{a.name}</span>
            <span className="font-mono text-[11.5px] text-muted">{counts[a.level]}</span>
          </li>
        ))}
      </ul>
      {ats && (
        <button type="button" aria-expanded={open === "ats"} onClick={() => setOpen(open === "ats" ? null : "ats")} className="flex h-9 items-center gap-2 rounded-[9px] pr-1.5 pl-2.5 hover:bg-paper">
          <span className="text-[13px] font-medium text-muted">ATS</span>
          <span className={cx("grid h-[26px] min-w-[34px] place-items-center rounded-[7px] px-1.5 text-[15px] font-bold", band)}>{ats.score}</span>
        </button>
      )}
      <div className="relative">
        <button type="button" aria-expanded={open === "export"} onClick={() => setOpen(open === "export" ? null : "export")} className="flex h-9 items-center gap-1.5 rounded-[9px] border border-control bg-surface pr-2.5 pl-3 text-[13.5px] font-medium hover:border-muted">
          Export
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5.5 7 9.5 11 5.5" />
          </svg>
        </button>
        {open === "export" && (
          <div className="absolute top-[46px] right-0 z-20 flex w-[210px] flex-col gap-0.5 rounded-xl bg-surface p-1.5 shadow-[0_1px_2px_rgba(14,17,22,0.08),0_10px_28px_rgba(14,17,22,0.16)]">
            <a href={`/api/cvs/${cvId}/export?format=pdf`} onClick={() => setOpen(null)} className="flex h-9 items-center justify-between rounded-lg px-2.5 text-sm hover:bg-paper">
              PDF <span className="text-[12.5px] text-muted">1 page</span>
            </a>
            <a href={`/api/cvs/${cvId}/export?format=docx`} onClick={() => setOpen(null)} className="flex h-9 items-center justify-between rounded-lg px-2.5 text-sm hover:bg-paper">
              Word (DOCX) <span className="text-[12.5px] text-muted">ATS-friendly</span>
            </a>
          </div>
        )}
      </div>
      {open === "ats" && ats && (
        <div role="dialog" aria-label="ATS score" className="absolute top-[58px] right-0 z-20 flex w-[360px] max-w-full flex-col gap-3 rounded-[14px] bg-surface p-4 shadow-[0_1px_2px_rgba(14,17,22,0.08),0_14px_36px_rgba(14,17,22,0.2)]">
          <div className="flex items-center gap-3">
            <span className={cx("grid h-10 w-12 shrink-0 place-items-center rounded-[10px] text-[22px] font-bold", band)}>{ats.score}</span>
            <span>
              <span className="block text-[15px] font-semibold">ATS score</span>
              <span className="block text-[13px] text-muted">{ats.score >= 85 ? "Strong" : ats.score >= 70 ? "Good, with room to improve" : "Weak"}</span>
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-2">An estimate of how an applicant tracking system would match this CV to the listing. Keywords count most.</p>
          <ul>
            {ats.checks.map((c) => (
              <li key={c.label} className="flex justify-between gap-3 border-t border-paper py-2 text-[13.5px]">
                <span className="text-ink-2">{c.label}</span>
                <span className={cx("text-right font-semibold", c.ok ? "text-[#14593a]" : "text-ink")}>
                  {c.value} <span className="font-mono text-[11.5px] font-normal text-muted">{c.points}/{c.max}</span>
                </span>
              </li>
            ))}
            {ats.missing.length > 0 && (
              <li className="flex justify-between gap-3 border-t border-paper py-2 text-[13.5px]">
                <span className="text-ink-2">Missing</span>
                <span className="text-right font-semibold text-[#8a1c10]">{ats.missing.slice(0, 6).join(", ")}</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function ViewingBanner({ version, onBack, onRestore }: { version: ViewedVersion; onBack: () => void; onRestore: () => void }) {
  const at = new Date(version.at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div role="status" className="flex w-full max-w-[720px] flex-wrap items-center gap-2.5 rounded-xl bg-ink py-1.5 pr-1.5 pl-4 text-white shadow-[0_6px_20px_rgba(14,17,22,0.25)]">
      <span className="text-[13.5px] whitespace-nowrap">
        Viewing <b className="font-semibold">v{version.n}</b> · {at}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-[#c5cad3]">{version.summary}</span>
      <button type="button" onClick={onRestore} className="h-[34px] rounded-lg bg-white px-3 text-[13px] font-semibold text-ink">
        Restore v{version.n}
      </button>
      <button type="button" onClick={onBack} className="h-[34px] rounded-lg px-2.5 text-[13px] font-medium hover:bg-white/10">
        Back to latest
      </button>
    </div>
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
          Save as new version
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
              <span className="font-mono text-xs text-muted">{stageDate(t.status) || " "}</span>
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
