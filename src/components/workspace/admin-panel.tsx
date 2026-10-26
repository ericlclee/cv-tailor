"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { toast, toastError } from "../toast";
import { Button, Input } from "../ui";
import { copyText, useOrigin } from "./activity-panel";
import { DocBar, DocBody, DocPanel, SectionLabel } from "./doc";

// The owner's page: approve people's emails and see who has an account.

interface Person {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: "owner" | "member";
  createdAt: string;
  lastSignInAt: string;
  connected: boolean;
  password: boolean;
}
interface AdminData {
  me: string;
  users: Person[];
  approved: { email: string; approvedAt: string }[];
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function AdminPanel() {
  const [data, setData] = useState<AdminData | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const origin = useOrigin();

  const load = useCallback(() => {
    api<AdminData>("/api/admin").then(setData).catch(toastError);
  }, []);
  useEffect(load, [load]);

  async function approve(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/approvals", { body: { email } });
      toast(`${email.trim()} can now sign in`);
      setEmail("");
      load();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(email: string) {
    try {
      await api(`/api/admin/approvals/${encodeURIComponent(email)}`, { method: "DELETE" });
      toast("Approval withdrawn");
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
      <DocBar title="People" />
      <DocBody>
        <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface px-6 py-5">
          <h2 className="text-base font-semibold">Approve someone</h2>
          <p className="text-sm leading-relaxed text-ink-2">Add the email of their Google account. They can then sign in at this app&apos;s address, with Google or with a password they set by email; nobody else can.</p>
          <form onSubmit={approve} className="flex flex-wrap gap-2">
            <Input type="email" required placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-0 flex-1" aria-label="Their Google email" />
            <Button variant="primary" type="submit" loading={busy} disabled={!email.trim()}>
              Approve
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <span>Send them the address:</span>
            <code className="text-[13px]">{origin}</code>
            <Button size="sm" variant="ghost" onClick={() => copyText(origin, "Address copied")}>
              Copy
            </Button>
          </div>
        </section>

        {data && data.approved.length > 0 && (
          <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-6 py-5">
            <SectionLabel>Approved, not signed in yet</SectionLabel>
            <ul className="flex flex-col">
              {data.approved.map((a) => (
                <li key={a.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-paper py-2.5 first:border-t-0">
                  <span className="flex-1 text-[15px]">{a.email}</span>
                  <span className="text-[13px] text-muted">approved {day(a.approvedAt)}</span>
                  <Button size="sm" variant="ghost" onClick={() => withdraw(a.email)}>
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
                    {p.password ? " · password set" : ""}
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
