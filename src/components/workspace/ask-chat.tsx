"use client";

import { useEffect, useState } from "react";
import { AMBITION, ambitionName, type Ambition } from "@/lib/ambition";
import { hasNumber } from "@/lib/format";
import type { CvContent } from "@/lib/types";
import { cx } from "../ui";
import { copyText } from "./activity-panel";
import { chooseAmbition, draftPrompt, SUMMARY, type AppData } from "./application-doc";

// The CV tab's actions in the activity panel. The app can't send anything to the chat,
// so each action is a prompt to copy: for the lines the user picked in the CV, or,
// with none picked, for what the checks found across the whole CV.

interface PickedLine {
  id: string;
  /** Where it is on the CV, e.g. "Brightcart · line 2". */
  where: string;
  text: string;
  level: Ambition;
}

function cvLines(content: CvContent, rating: AppData["rating"]): Map<string, PickedLine> {
  const out = new Map<string, PickedLine>();
  if (content.summary) out.set(SUMMARY, { id: SUMMARY, where: "Summary", text: content.summary, level: rating?.summary ?? 0 });
  for (const s of content.sections) {
    if (!s.include) continue;
    for (const it of s.items) {
      if (!it.include) continue;
      it.bullets.filter((b) => b.include).forEach((b, k) => out.set(b.id, { id: b.id, where: `${it.organization || it.title} · line ${k + 1}`, text: b.text, level: rating?.bullets[b.id] ?? 0 }));
    }
  }
  return out;
}

interface Prompt {
  key: string;
  /** What the button shows; the prompt itself when not set. */
  label?: string;
  text: string;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function AskChat({ data, update, role, selected, onClear, onEdit, viewing }: { data: AppData; update: (d: AppData) => void; role: string; selected: string[]; onClear: () => void; onEdit: (id: string) => void; viewing: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  const cv = data.cv;
  const level = data.job.ambition;
  const name = ambitionName(level);
  const lines = cv ? cvLines(cv.content, data.rating) : new Map<string, PickedLine>();
  const picked = selected.map((id) => lines.get(id)).filter((l): l is PickedLine => !!l);
  const missing = data.ats?.missing ?? [];
  const prompts: Prompt[] = [];

  if (!cv) {
    prompts.push({ key: "draft", text: draftPrompt(role, level, false) });
  } else if (picked.length) {
    // Prompts that quote the picked lines, chosen from what those lines need.
    const one = picked.length === 1;
    const ref = `${one ? "this line" : `these ${picked.length} lines`}: ${picked.map((l) => `“${l.text}”`).join("; ")}`;
    const lead = `In my CV Tailor CV for ${role}, `;
    if (picked.some((l) => l.level > level)) prompts.push({ key: "tone", label: `Tone down to ${name}`, text: `${lead}tone down ${ref}. Bring ${one ? "it" : "them"} to the ${name} ambition level.` });
    if (picked.some((l) => !hasNumber(l.text))) prompts.push({ key: "figure", label: "Add a figure", text: `${lead}add a figure to ${ref}.` });
    if (missing.length) prompts.push({ key: "keyword", label: `Work in “${missing[0]}”`, text: `${lead}work “${missing[0]}” into ${ref}.` });
    if (picked.some((l) => l.level < level)) prompts.push({ key: "raise", label: `Rewrite at ${name}`, text: `${lead}rewrite ${ref} at the ${name} ambition level.` });
    prompts.push({ key: "shorten", label: "Shorten", text: `${lead}shorten ${ref}.` });
    prompts.push({ key: "stronger", label: "Make it stronger", text: `${lead}make ${ref} stronger.` });
  } else {
    const all = [...lines.values()];
    const over = all.filter((l) => l.level > level).length;
    const noFigure = all.filter((l) => l.id !== SUMMARY && !hasNumber(l.text)).length;
    if (cv.ambition !== undefined && cv.ambition !== level) prompts.push({ key: "redraft", text: draftPrompt(role, level, true) });
    if (over) prompts.push({ key: "tone", text: `Tone down the ${plural(over, "line")} above ${name} in my CV Tailor CV for ${role}.` });
    if (missing.length) prompts.push({ key: "keywords", text: `Work the missing job keywords (${missing.slice(0, 3).join(", ")}) into my CV Tailor CV for ${role}.` });
    if (noFigure) prompts.push({ key: "figures", text: `Add a figure to the ${plural(noFigure, "line")} without a number in my CV Tailor CV for ${role}.` });
    if (!prompts.length) prompts.push({ key: "review", text: `Review my CV Tailor CV for ${role} and suggest improvements.` });
  }

  function copy(p: Prompt) {
    copyText(p.text, "Prompt copied");
    setCopied(p.key);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2.5">
        <p className="text-[13px] font-semibold text-ink-2">{picked.length ? "Ask your chat about the selection" : "Ask your chat"}</p>
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          Ambition
          <select value={level} onChange={(e) => chooseAmbition(data, update, Number(e.target.value) as Ambition)} className="h-[30px] rounded-lg border border-control bg-surface px-2 text-[13px] font-medium text-ink">
            {AMBITION.map((a) => (
              <option key={a.level} value={a.level}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {viewing ? (
        <p className="rounded-[10px] bg-paper px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">You&apos;re looking at an earlier version. Go back to the latest, or restore this one, to ask for changes.</p>
      ) : (
        <>
          {picked.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-[10px] border border-[#c9d4ff] bg-[#f2f4ff] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[12.5px] font-semibold text-accent-strong">{picked.length === 1 ? "Selected line" : `${picked.length} lines selected`}</span>
                {picked.length === 1 && (
                  <button type="button" onClick={() => onEdit(picked[0].id)} className="h-7 rounded-[7px] border border-control bg-surface px-2.5 text-[12.5px] font-medium hover:border-muted">
                    Edit it yourself
                  </button>
                )}
                <button type="button" onClick={onClear} className="h-7 rounded-[7px] px-2 text-[12.5px] font-medium text-ink-2 hover:bg-black/[0.04]">
                  Clear
                </button>
              </div>
              {picked.slice(0, 2).map((l) => (
                <p key={l.id} className="line-clamp-2 text-[13px] leading-snug">
                  <span className="mr-1.5 font-mono text-[10.5px] tracking-[0.06em] text-faint uppercase">{l.where}</span>
                  {l.text}
                </p>
              ))}
              {picked.length > 2 && <p className="text-xs text-muted">+ {picked.length - 2} more</p>}
            </div>
          )}
          {prompts.slice(0, picked.length ? 4 : 3).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => copy(p)}
              className={cx("flex items-start gap-2.5 rounded-[10px] border px-3 py-2 text-left text-[13px] leading-snug", copied === p.key ? "border-[#1b7f4b] bg-[#eef8f1]" : "border-control hover:border-muted")}
            >
              <span className="min-w-0 flex-1">{p.label ?? `“${p.text}”`}</span>
              <span className={cx("shrink-0 pt-px text-xs font-semibold", copied === p.key ? "text-[#14593a]" : "text-accent")}>{copied === p.key ? "Copied" : "Copy"}</span>
            </button>
          ))}
          <p className="text-xs leading-relaxed text-muted">
            {!cv
              ? "Paste it into your chat. The draft shows up above as version 1."
              : picked.length
                ? `Each prompt quotes the selected ${picked.length === 1 ? "line" : "lines"}, so your chat knows exactly what to change.`
                : "Tip: click lines in the CV to get prompts for just those lines. What your chat changes shows up above as a new version."}
          </p>
        </>
      )}
    </div>
  );
}
