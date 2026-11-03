"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CvRating } from "@/lib/ambition";
import { api } from "@/lib/client/api";
import { announceViewing, emitRefresh, useGoToVersion, useRefresh } from "@/lib/client/bus";
import { CLOSED_STATUSES, type CvVersion } from "@/lib/types";
import { toast, toastError } from "../toast";
import { Spinner, cx } from "../ui";
import { ActivityPanel } from "./activity-panel";
import { ApplicationDocument, markApplied, type AppData, type CvState, type ViewedVersion } from "./application-doc";
import { AskChat } from "./ask-chat";
import { DocBody } from "./doc";

// An application's page: the document (job description, CV or status) with the steps
// along the bottom, and the activity panel on the right. The tab lives in the URL but
// switches in the browser (history.pushState), so changing tabs never waits for the server.

export type AppTab = "match" | "cv" | "timeline";

export function ApplicationView({ id, role, context }: { id: string; role: string; context: string }) {
  const param = useSearchParams().get("tab");
  const tab: AppTab = param === "cv" ? "cv" : param === "timeline" ? "timeline" : "match";

  const select = useCallback(
    (next: AppTab) => {
      if (next === tab) return;
      window.history.pushState(null, "", next === "match" ? `/apps/${id}` : `/apps/${id}?tab=${next}`);
    },
    [id, tab],
  );

  const [data, setData] = useState<AppData | null>(null);
  const [missing, setMissing] = useState(false);
  const load = useCallback(() => {
    api<AppData>(`/api/applications/${id}`)
      .then(setData)
      .catch(() => setMissing(true));
  }, [id]);
  useEffect(load, [load]);
  useRefresh(load);

  // When the chat finishes reading the listing while you're on the job description,
  // move on to the CV tab, where the next step is choosing the ambition level.
  // A new title (curating replaces the rough guess) also refreshes the server-rendered
  // role name used by the prompts and the activity panel.
  const router = useRouter();
  const seen = useRef<{ id: string; curated: boolean; title: string } | null>(null);
  useEffect(() => {
    if (!data || data.job.id !== id) return;
    const curated = Boolean(data.job.curatedAt);
    const title = `${data.job.parsed.title}|${data.job.parsed.company}`;
    if (seen.current?.id === id) {
      if (!seen.current.curated && curated && tab === "match") {
        toast("Your chat has read the listing. Choose the ambition level, then draft your CV.");
        select("cv");
      }
      if (seen.current.title !== title) router.refresh();
    }
    seen.current = { id, curated, title };
  }, [data, id, tab, select, router]);

  // The CV version on screen (null: the latest), the lines picked for the chat, and the line being edited.
  const [viewing, setViewing] = useState<number | null>(null);
  const [viewed, setViewed] = useState<ViewedVersion | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const cvId = data?.cv?.id;
  const latest = data?.versions?.latest ?? 1;

  const goTo = useCallback(
    (n: number | null) => {
      setViewing(n === latest ? null : n);
      setSelected([]);
      setEditing(null);
      if (n !== null) select("cv");
    },
    [latest, select],
  );
  useGoToVersion(goTo);

  useEffect(() => {
    if (!viewing || !cvId) return;
    let live = true;
    api<{ version: CvVersion; rating: CvRating }>(`/api/cvs/${cvId}/versions/${viewing}`)
      .then(({ version: v, rating }) => live && setViewed({ n: v.n, at: v.at, summary: v.summary, content: v.content, rating }))
      .catch((e) => {
        toastError(e);
        setViewing(null);
      });
    return () => {
      live = false;
    };
  }, [viewing, cvId]);
  const shown = viewing && viewed?.n === viewing ? viewed : null;

  useEffect(() => {
    announceViewing({ appId: id, n: viewing });
  }, [id, viewing]);
  useEffect(
    () => () => {
      announceViewing({ appId: id, n: null });
    },
    [id],
  );

  async function restore(n: number) {
    try {
      await api(`/api/cvs/${cvId}/versions/${n}`, { method: "POST" });
      toast(`v${n} is the latest again, as a new version`);
      setViewing(null);
      load();
      emitRefresh();
    } catch (e) {
      toastError(e);
    }
  }

  const cvState: CvState = {
    viewed: shown,
    selected,
    onSelect: (lineId) => setSelected((s) => (s.includes(lineId) ? s.filter((x) => x !== lineId) : [...s, lineId])),
    editing,
    onEdit: (lineId) => {
      setEditing(lineId);
      if (lineId) setSelected([]);
    },
    onBack: () => setViewing(null),
    onRestore: restore,
  };

  const prompts =
    tab === "timeline"
      ? [`I applied for ${role} today. Update CV Tailor.`, `Help me prepare for my ${role} interview using my CV Tailor profile.`]
      : [`Go through the gaps for ${role} in CV Tailor with me.`, `Draft my CV for ${role} in CV Tailor.`];

  return (
    <>
      <div className="flex w-full min-w-0 flex-col bg-paper lg:h-full lg:flex-1">
        <main className="flex-1 lg:overflow-y-auto">
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
          ) : (
            <ApplicationDocument data={data} tab={tab} role={role} reload={load} update={setData} onTab={select} cvState={cvState} />
          )}
        </main>
        {data && <Steps data={data} tab={tab} onTab={select} reload={load} />}
      </div>
      <ActivityPanel
        key={id}
        scope={id}
        context={context}
        prompts={prompts}
        versions={data?.cv ? { latest, viewing, sent: data.versions?.sent ?? null, onGo: goTo } : undefined}
        footer={tab === "cv" && data ? <AskChat data={data} update={setData} role={role} selected={selected} onClear={() => setSelected([])} onEdit={cvState.onEdit} viewing={!!viewing} /> : undefined}
      />
    </>
  );
}

/** Where the application is: job description, then CV, then status. Each step opens its tab. */
function Steps({ data, tab, onTab, reload }: { data: AppData; tab: AppTab; onTab: (t: AppTab) => void; reload: () => void }) {
  const { job, cv, requirements: reqs } = data;
  const backed = reqs.filter((r) => r.state === "proven" || r.state === "weak").length;
  const applied = job.status !== "saved" && job.status !== "cv";
  const statusLabel = { saved: "Not applied yet", cv: "Not applied yet", applied: "Applied", interview: "Interviewing", offer: "Offer", rejected: "Not progressed", withdrawn: "Withdrawn" }[job.status];
  const steps: { tab: AppTab; label: string; detail: string; done: boolean }[] = [
    { tab: "match", label: "Job description", detail: job.curatedAt ? `${backed} of ${reqs.length} requirements backed` : "Not read yet", done: Boolean(job.curatedAt) },
    { tab: "cv", label: "CV", detail: cv ? `v${data.versions?.latest ?? 1}${data.ats ? ` · ATS ${data.ats.score}` : ""}` : "Not drafted yet", done: Boolean(cv) },
    { tab: "timeline", label: "Status", detail: statusLabel, done: applied && !CLOSED_STATUSES.includes(job.status) },
  ];
  return (
    <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-soft bg-surface px-4 py-2.5">
      <nav aria-label="Application steps" className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <div key={s.tab} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true" className={cx("hidden h-0.5 w-5 rounded-sm sm:block", steps[i - 1].done ? "bg-accent" : "bg-line")} />}
            <a
              href={s.tab === "match" ? `/apps/${job.id}` : `/apps/${job.id}?tab=${s.tab}`}
              aria-current={tab === s.tab ? "step" : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                onTab(s.tab);
              }}
              className={cx("flex items-center gap-2 rounded-xl border-[1.5px] py-1.5 pr-2.5 pl-1.5", tab === s.tab ? "border-accent bg-accent-soft" : "border-transparent hover:bg-paper")}
            >
              <span aria-hidden="true" className={cx("grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold", s.done ? "bg-accent text-white" : tab === s.tab ? "bg-ink text-white" : "border-2 border-control text-muted")}>
                {s.done ? (
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7.5 6 10.5 11.5 4" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-[12.5px] text-muted">{s.detail}</span>
              </span>
            </a>
          </div>
        ))}
      </nav>
      {cv && !applied && (
        <button type="button" onClick={() => markApplied(job.id, reload)} className="h-10 rounded-[10px] bg-accent px-[18px] text-sm font-semibold whitespace-nowrap text-white hover:bg-accent-strong">
          Mark as applied
        </button>
      )}
    </footer>
  );
}
