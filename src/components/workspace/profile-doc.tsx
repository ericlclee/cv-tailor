"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { emitRefresh, useRefresh } from "@/lib/client/bus";
import { ENTRY_KINDS, type Entry, type EntryKind, type Profile, type Skill } from "@/lib/types";
import { EntryCard } from "../entry-editor";
import { ContactCard, SkillsCard } from "../profile-cards";
import { toastError } from "../toast";
import { Button, Spinner } from "../ui";
import { DocBar, DocBody, DocPanel, Meter, SectionLabel } from "./doc";

interface Master {
  profile: Profile;
  entries: Entry[];
  skills: Skill[];
  strength: number;
}

function blankEntry(kind: EntryKind): Entry {
  return { id: `new-${Date.now()}`, kind, title: "", organization: "", location: "", startDate: "", endDate: "", current: false, description: "", url: "", achievements: [], sort: 0, updatedAt: new Date().toISOString() };
}

export function ProfileDocument() {
  const [m, setM] = useState<Master | null>(null);
  const [adding, setAdding] = useState<Entry | null>(null);
  const load = useCallback(() => {
    api<Master>("/api/master").then(setM).catch(toastError);
  }, []);
  useEffect(load, [load]);
  useRefresh(load);

  const onSaved = () => {
    setAdding(null);
    load();
    emitRefresh();
  };

  return (
    <DocPanel>
      <DocBar title="Master profile">
        <span className="text-sm text-muted">Strength</span>
        <Meter value={m?.strength ?? 0} />
        <span className="font-mono text-sm font-medium">{m ? m.strength : "–"}</span>
      </DocBar>
      <DocBody>
        {!m ? (
          <div className="flex items-center gap-2 text-muted">
            <Spinner /> Loading…
          </div>
        ) : (
          <>
            <ContactCard key={JSON.stringify(m.profile)} profile={m.profile} onSaved={(profile) => setM({ ...m, profile })} />

            {ENTRY_KINDS.map(({ kind, plural, label }) => {
              const items = m.entries.filter((e) => e.kind === kind);
              const isAdding = adding?.kind === kind;
              if (!items.length && !isAdding && kind !== "experience") return null;
              return (
                <section key={kind} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between px-1">
                    <SectionLabel>{plural}</SectionLabel>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(blankEntry(kind))}>
                      + Add {label.toLowerCase()}
                    </Button>
                  </div>
                  {isAdding && <EntryCard key={adding.id} entry={adding} startOpen onSaved={onSaved} onDeleted={() => setAdding(null)} />}
                  {!items.length && !isAdding && (
                    <div className="flex flex-col gap-1.5 rounded-xl border-[1.5px] border-dashed border-control px-6 py-5">
                      <p className="text-[15px] font-semibold">Your roles will appear here</p>
                      <p className="text-sm leading-relaxed text-muted">Connect your chat (see the right-hand panel), then share your CV or tell it about your most recent job. Each achievement is saved on its own so it can be reused for every job.</p>
                    </div>
                  )}
                  {items.map((e) => (
                    <EntryCard key={`${e.id}-${e.updatedAt}`} entry={e} onSaved={onSaved} onDeleted={onSaved} />
                  ))}
                </section>
              );
            })}

            <SkillsCard key={JSON.stringify(m.skills)} skills={m.skills} onSaved={(skills) => setM({ ...m, skills })} />

            <div className="flex flex-wrap items-center gap-2 px-1">
              <span className="text-sm text-muted">Add a section:</span>
              {ENTRY_KINDS.filter((k) => k.kind !== "experience" && !m.entries.some((e) => e.kind === k.kind)).map((k) => (
                <Button key={k.kind} size="sm" onClick={() => setAdding(blankEntry(k.kind))}>
                  + {k.label}
                </Button>
              ))}
            </div>

            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[13px] text-muted">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-accent" />
                Has a number
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-full border-2 border-warn" />
                No number yet
              </span>
              <span>Edit anything yourself, or ask your chat.</span>
            </p>
          </>
        )}
      </DocBody>
    </DocPanel>
  );
}
