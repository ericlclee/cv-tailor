"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { formatRange, hasNumber } from "@/lib/format";
import { ENTRY_KINDS, type Achievement, type Entry } from "@/lib/types";
import { toast, toastError } from "./toast";
import { Badge, Button, Card, Field, Input, TagInput, Textarea, cx } from "./ui";

/** Labels for title/organization differ by kind ("Degree" vs "Job title"). */
export function fieldLabels(kind: Entry["kind"]) {
  switch (kind) {
    case "education":
      return { title: "Degree / qualification", org: "Institution", bullets: "Highlights (grades, thesis, activities)" };
    case "project":
      return { title: "Project name", org: "Context (company, course, personal)", bullets: "What you did and the result" };
    case "certification":
      return { title: "Certification", org: "Issuer", bullets: "Details" };
    case "award":
      return { title: "Award", org: "Awarded by", bullets: "Details" };
    case "publication":
      return { title: "Title", org: "Publisher / venue", bullets: "Details" };
    case "volunteer":
      return { title: "Role", org: "Organization", bullets: "What you did and the result" };
    default:
      return { title: "Job title", org: "Company", bullets: "Achievements" };
  }
}

export function EntryCard({ entry, onSaved, onDeleted, startOpen }: { entry: Entry; onSaved: (e: Entry) => void; onDeleted: (id: string) => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(!!startOpen);
  const [now] = useState(() => Date.now());
  const labels = fieldLabels(entry.kind);

  if (open) {
    return <EntryForm entry={entry} onCancel={() => setOpen(false)} onSaved={(e) => (onSaved(e), setOpen(false))} onDeleted={onDeleted} />;
  }
  const fresh = now - new Date(entry.updatedAt).getTime() < 3 * 60 * 1000;
  return (
    <div className={cx("rounded-[14px] border bg-surface px-6 py-5", fresh ? "border-hl ring-2 ring-hl-soft" : "border-line")}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-base">
            <strong className="font-semibold">{entry.title || <span className="text-faint">Untitled {labels.title.toLowerCase()}</span>}</strong>
            {entry.organization && <span> · {entry.organization}</span>}
          </p>
          {entry.location && <p className="text-sm text-muted">{entry.location}</p>}
        </div>
        <div className="flex items-center gap-2">
          {fresh && <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-white">Updated</span>}
          <span className="font-mono text-[13px] text-muted">{formatRange(entry.startDate, entry.endDate, entry.current)}</span>
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Edit ${entry.title || "entry"}`}>
            Edit
          </Button>
        </div>
      </div>
      {entry.achievements.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {entry.achievements.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5 text-[15px] leading-relaxed">
              {entry.kind === "education" ? (
                <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-faint" />
              ) : (
                <span
                  title={hasNumber(a.text) ? "Has a number" : "No number yet"}
                  className={cx("mt-[7px] size-2.5 shrink-0 rounded-full", hasNumber(a.text) ? "bg-accent" : "border-2 border-warn")}
                />
              )}
              <span>{a.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        ["experience", "project", "volunteer"].includes(entry.kind) && <p className="mt-3 text-sm text-warn-ink">No achievements yet. Tell your chat what you did here.</p>
      )}
    </div>
  );
}

function EntryForm({ entry, onCancel, onSaved, onDeleted }: { entry: Entry; onCancel: () => void; onSaved: (e: Entry) => void; onDeleted: (id: string) => void }) {
  const [draft, setDraft] = useState<Entry>(entry);
  const [saving, setSaving] = useState(false);
  const labels = fieldLabels(draft.kind);
  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setAch = (i: number, a: Partial<Achievement>) =>
    set("achievements", draft.achievements.map((x, j) => (j === i ? { ...x, ...a } : x)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...draft.achievements];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set("achievements", next);
  };

  async function save() {
    setSaving(true);
    try {
      const isNew = entry.id.startsWith("new-");
      const body = { ...draft, id: isNew ? undefined : draft.id };
      const saved = await api<Entry>(isNew ? "/api/entries" : `/api/entries/${entry.id}`, { method: isNew ? "POST" : "PUT", body });
      onSaved(saved);
      toast("Saved");
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!confirm("Delete this entry from your master profile?")) return;
    if (!entry.id.startsWith("new-")) await api(`/api/entries/${entry.id}`, { method: "DELETE" }).catch(toastError);
    onDeleted(entry.id);
  }

  return (
    <Card className="p-4 ring-2 ring-accent/15">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={labels.title}>
          <Input value={draft.title} onChange={(e) => set("title", e.target.value)} autoFocus />
        </Field>
        <Field label={labels.org}>
          <Input value={draft.organization} onChange={(e) => set("organization", e.target.value)} />
        </Field>
        <Field label="Location">
          <Input value={draft.location} onChange={(e) => set("location", e.target.value)} placeholder="City, Country or Remote" />
        </Field>
        <Field label="Type">
          <select
            value={draft.kind}
            onChange={(e) => set("kind", e.target.value as Entry["kind"])}
            className="h-9 w-full rounded-md border border-line bg-surface px-2 text-sm"
          >
            {ENTRY_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start">
          <Input type="month" value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="End">
          <div className="flex items-center gap-3">
            <Input type="month" value={draft.current ? "" : draft.endDate} disabled={draft.current} onChange={(e) => set("endDate", e.target.value)} />
            <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
              <input type="checkbox" checked={draft.current} onChange={(e) => set("current", e.target.checked)} />
              Current
            </label>
          </div>
        </Field>
        <Field label="Description (optional)" className="sm:col-span-2" hint="Context about the team, product or scope. Not shown on the CV unless the AI uses it.">
          <Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        {["project", "publication", "certification"].includes(draft.kind) && (
          <Field label="Link" className="sm:col-span-2">
            <Input value={draft.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
          </Field>
        )}
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium text-muted">{labels.bullets}</p>
        <div className="space-y-3">
          {draft.achievements.map((a, i) => (
            <div key={a.id} className="rounded-md border border-line p-3">
              <Textarea
                value={a.text}
                onChange={(e) => setAch(i, { text: e.target.value })}
                placeholder="e.g. Cut checkout load time by 40% by moving image processing to a background queue"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="min-w-48 flex-1">
                  <TagInput value={a.skills} onChange={(skills) => setAch(i, { skills })} placeholder="Skills shown here (Enter to add)" />
                </div>
                {!hasNumber(a.text) && a.text && draft.kind !== "education" && <Badge tone="warn">Add a number?</Badge>}
                <div className="flex">
                  <Button size="sm" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === draft.achievements.length - 1}>
                    ↓
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => set("achievements", draft.achievements.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button
          size="sm"
          className="mt-3"
          onClick={() => set("achievements", [...draft.achievements, { id: `tmp-${Date.now()}`, text: "", skills: [], metrics: [] }])}
        >
          + Add {draft.kind === "education" ? "highlight" : "achievement"}
        </Button>
      </div>

      <div className={cx("mt-5 flex items-center justify-between border-t border-line pt-4")}>
        <Button variant="danger" size="sm" onClick={del}>
          Delete entry
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={entry.id.startsWith("new-") ? () => onDeleted(entry.id) : onCancel}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </Card>
  );
}
