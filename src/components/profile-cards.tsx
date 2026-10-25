"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { emitRefresh } from "@/lib/client/bus";
import type { Profile, Skill } from "@/lib/types";
import { toast, toastError } from "./toast";
import { Button, Field, Input, TagInput, Textarea } from "./ui";

// Contact details and skills in the master profile document: read view with an Edit toggle.

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-[11px] tracking-[0.08em] text-faint uppercase">{children}</p>
);

export function ContactCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [editing, setEditing] = useState(false);
  const [p, setP] = useState(profile);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP({ ...p, [k]: v });

  async function save() {
    setSaving(true);
    try {
      onSaved(await api<Profile>("/api/profile", { method: "PUT", body: p }));
      emitRefresh();
      setEditing(false);
      toast("Details saved");
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const line = [profile.headline, profile.location, profile.email, profile.phone].filter(Boolean).join(" · ");
    return (
      <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>About you</SectionLabel>
          <Button size="sm" variant="ghost" onClick={() => (setP(profile), setEditing(true))}>
            Edit
          </Button>
        </div>
        {profile.name ? (
          <>
            <p className="text-[22px] font-semibold tracking-tight">{profile.name}</p>
            {line && <p className="text-[15px] text-ink-2">{line}</p>}
            {profile.links.length > 0 && <p className="text-sm text-muted">{profile.links.map((l) => l.url.replace(/^https?:\/\/(www\.)?/, "")).join(" · ")}</p>}
            {profile.summary && <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{profile.summary}</p>}
          </>
        ) : (
          <p className="text-sm text-muted">Your name, headline and contact details. Attach a CV in the chat, or add them here.</p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-[14px] border border-line bg-surface px-6 py-5 ring-2 ring-accent/15">
      <SectionLabel>About you</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <Input value={p.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </Field>
        <Field label="Headline" hint="e.g. Product designer with 6 years in fintech">
          <Input value={p.headline} onChange={(e) => set("headline", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={p.email} onChange={(e) => set("email", e.target.value)} type="email" />
        </Field>
        <Field label="Phone">
          <Input value={p.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Location">
          <Input value={p.location} onChange={(e) => set("location", e.target.value)} placeholder="City, Country" />
        </Field>
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-muted">Links</span>
        <div className="space-y-2">
          {p.links.map((l, i) => (
            <div key={i} className="flex gap-1.5">
              <Input className="w-28" value={l.label} placeholder="LinkedIn" onChange={(e) => set("links", p.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <Input value={l.url} placeholder="https://" onChange={(e) => set("links", p.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <Button variant="ghost" size="sm" className="h-9" aria-label="Remove link" onClick={() => set("links", p.links.filter((_, j) => j !== i))}>
                ×
              </Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => set("links", [...p.links, { label: "", url: "" }])}>
            + Add link
          </Button>
        </div>
      </div>
      <Field label="Default summary" hint="A starting point. Each tailored CV gets its own version.">
        <Textarea value={p.summary} onChange={(e) => set("summary", e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button variant="primary" loading={saving} onClick={save}>
          Save
        </Button>
      </div>
    </section>
  );
}

export function SkillsCard({ skills, onSaved }: { skills: Skill[]; onSaved: (s: Skill[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState(skills);
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState("");
  const categories = [...new Set(items.map((s) => s.category || "General"))];
  if (!categories.length) categories.push("General");

  const setCategory = (cat: string, names: string[]) => {
    const others = items.filter((s) => (s.category || "General") !== cat);
    const existing = new Map(items.filter((s) => (s.category || "General") === cat).map((s) => [s.name, s]));
    setItems([...others, ...names.map((n) => existing.get(n) ?? { id: "", name: n, category: cat === "General" ? "" : cat })]);
  };

  async function save() {
    setSaving(true);
    try {
      const saved = await api<Skill[]>("/api/skills", { method: "PUT", body: items });
      onSaved(saved);
      emitRefresh();
      setEditing(false);
      toast("Skills saved");
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>Skills</SectionLabel>
          <Button size="sm" variant="ghost" onClick={() => (setItems(skills), setEditing(true))}>
            Edit
          </Button>
        </div>
        {skills.length ? (
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <span key={s.id} className="rounded-md bg-paper px-2.5 py-1 text-sm">
                {s.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No skills yet.</p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-[14px] border border-line bg-surface px-6 py-5 ring-2 ring-accent/15">
      <SectionLabel>Skills</SectionLabel>
      {categories.map((cat) => (
        <Field key={cat} label={cat}>
          <TagInput value={items.filter((s) => (s.category || "General") === cat).map((s) => s.name)} onChange={(names) => setCategory(cat, names)} placeholder="Type a skill, press Enter" />
        </Field>
      ))}
      <div className="flex gap-1.5">
        <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category, e.g. Languages" />
        <Button
          className="h-9"
          disabled={!newCat.trim()}
          onClick={() => {
            const name = prompt(`First skill in "${newCat.trim()}"?`);
            if (name?.trim()) setItems([...items, { id: "", name: name.trim(), category: newCat.trim() }]);
            setNewCat("");
          }}
        >
          Add group
        </Button>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button variant="primary" loading={saving} onClick={save}>
          Save
        </Button>
      </div>
    </section>
  );
}
