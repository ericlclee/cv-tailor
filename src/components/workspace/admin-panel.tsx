"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { toast, toastError } from "../toast";
import { Button, Input } from "../ui";
import { copyText } from "./activity-panel";
import { DocBar, DocBody, DocPanel, SectionLabel } from "./doc";

// The owner's page: invite people and see who has an account.

interface Person {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: "owner" | "member";
  createdAt: string;
  lastSignInAt: string;
  connected: boolean;
}
interface PendingInvite {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}
interface AdminData {
  me: string;
  users: Person[];
  invites: PendingInvite[];
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const inviteUrl = (id: string) => `${window.location.origin}/invite/${id}`;

export function AdminPanel() {
  const [data, setData] = useState<AdminData | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const load = useCallback(() => {
    api<AdminData>("/api/admin").then(setData).catch(toastError);
  }, []);
  useEffect(load, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/admin/invites", { body: { email } });
      setCreated(r.url);
      setEmail("");
      load();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    try {
      await api(`/api/admin/invites/${id}`, { method: "DELETE" });
      toast("Invite withdrawn");
      load();
    } catch (err) {
      toastError(err);
    }
  }

  async function removePerson(p: Person) {
    if (!confirm(`Remove ${p.name || p.email}? Their profile, applications and CVs are deleted for good.`)) return;
    try {
      await api(`/api/admin/users/${p.id}`, { method: "DELETE" });
      toast("Removed");
      load();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <DocPanel>
      <DocBar title="People and invites" />
      <DocBody>
        <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface px-6 py-5">
          <h2 className="text-base font-semibold">Invite someone</h2>
          <p className="text-sm leading-relaxed text-ink-2">They sign in with Google from the link. Add their email to make the link work only for that account. Links last 14 days and work once.</p>
          <form onSubmit={invite} className="flex flex-wrap gap-2">
            <Input type="email" placeholder="Their Google email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-0 flex-1" aria-label="Their Google email (optional)" />
            <Button variant="primary" type="submit" loading={busy}>
              Create invite link
            </Button>
          </form>
          {created && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2.5">
              <code className="min-w-0 flex-1 text-[13px] break-all">{created}</code>
              <Button size="sm" onClick={() => copyText(created, "Invite link copied")}>
                Copy
              </Button>
            </div>
          )}
        </section>

        {data && data.invites.length > 0 && (
          <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-6 py-5">
            <SectionLabel>Waiting to be used</SectionLabel>
            <ul className="flex flex-col">
              {data.invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-paper py-2.5 first:border-t-0">
                  <span className="flex-1 text-[15px]">{i.email || "Anyone with the link"}</span>
                  <span className="text-[13px] text-muted">expires {day(i.expiresAt)}</span>
                  <Button size="sm" variant="ghost" onClick={() => copyText(inviteUrl(i.id), "Invite link copied")}>
                    Copy link
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => withdraw(i.id)}>
                    Withdraw
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-6 py-5">
          <SectionLabel>People {data ? `· ${data.users.length}` : ""}</SectionLabel>
          {!data && <p className="text-sm text-muted">Loading…</p>}
          <ul className="flex flex-col">
            {data?.users.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-paper py-3 first:border-t-0">
                {p.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a small Google avatar
                  <img src={p.picture} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" />
                ) : (
                  <span aria-hidden="true" className="size-8 rounded-full bg-line" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-medium">
                    {p.name || p.email}
                    {p.role === "owner" && <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-xs font-medium text-ink-2">Owner</span>}
                  </span>
                  <span className="truncate text-[13px] text-muted">
                    {p.email} · joined {day(p.createdAt)} · last signed in {day(p.lastSignInAt)}
                    {p.connected ? " · chat connected" : ""}
                  </span>
                </span>
                {p.id !== data.me && (
                  <Button size="sm" variant="danger" onClick={() => removePerson(p)}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </DocBody>
    </DocPanel>
  );
}
