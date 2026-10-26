"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useRefresh } from "@/lib/client/bus";
import { TRACK, type AppStatus } from "@/lib/types";
import { cx } from "../ui";
import { Logo } from "./logo";

interface AppRow {
  id: string;
  title: string;
  company: string;
  status: AppStatus;
  reached: AppStatus;
  closed: boolean;
  statusLabel: string;
  dateLabelAt: string;
}
interface SidebarData {
  profile: { name: string; strength: number; started: boolean };
  apps: AppRow[];
}

interface Me {
  accounts: boolean;
  user: { name: string; email: string; picture: string; role: "owner" | "member" } | null;
  canSignOut: boolean;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "today";
  const opts: Intl.DateTimeFormatOptions = d > today ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" };
  return d.toLocaleDateString("en-GB", opts);
}

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [data, setData] = useState<SidebarData | null>(null);
  const load = useCallback(() => {
    api<SidebarData>("/api/applications").then(setData).catch(() => {});
  }, []);
  useEffect(load, [load, path]);
  useRefresh(load);

  const active = data?.apps.filter((a) => !a.closed) ?? [];
  const closed = data?.apps.filter((a) => a.closed) ?? [];

  return (
    <aside aria-label="Applications" className="flex w-full flex-col gap-4 border-b border-line-soft bg-sidebar px-3 py-4 lg:h-full lg:w-[264px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
      <Link href="/" className="flex items-center gap-2.5 px-2 py-1">
        <Logo />
        <span className="text-[17px] font-semibold tracking-tight">CV Tailor</span>
      </Link>

      <Link
        href="/"
        aria-current={path === "/" ? "page" : undefined}
        className={cx("flex items-center gap-2.5 rounded-[10px] px-3 py-2.5", path === "/" ? "bg-[#e4e7ec]" : "hover:bg-black/[0.04]")}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="9" cy="6" r="3" />
          <path d="M3 16c0-3.3 2.7-5 6-5s6 1.7 6 5" />
        </svg>
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold">Master profile</span>
          <span className="text-[13px] text-muted">{data ? (data.profile.started ? `Strength ${data.profile.strength} / 100` : "Not started") : " "}</span>
        </span>
      </Link>

      <Link
        href="/apps/new"
        aria-current={path === "/apps/new" ? "page" : undefined}
        className={cx(
          "flex min-h-11 items-center gap-2.5 rounded-[10px] border px-3 text-[15px] font-medium",
          path === "/apps/new" ? "border-ink bg-ink text-white" : "border-control bg-surface hover:border-muted",
        )}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
        New application
      </Link>

      <AppGroup label="Active" apps={active} path={path} empty={data ? "None yet. Paste a job link into the chat and it'll appear here, so you can follow it from draft to offer." : ""} />
      {closed.length > 0 && <AppGroup label="Closed" apps={closed} path={path} />}

      <span className="flex-1" />
      <Account path={path} fallbackName={data?.profile.name ?? ""} onSignOut={() => router.replace("/login")} />
    </aside>
  );
}

/** Who's signed in, with People (owner) and Sign out. In local mode, just the profile name. */
function Account({ path, fallbackName, onSignOut }: { path: string; fallbackName: string; onSignOut: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>("/api/me").then(setMe).catch(() => {});
  }, []);
  const name = me?.user?.name || fallbackName;
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (!me || (!name && !me.canSignOut)) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-line-soft pt-3">
      {name && (
        <div className="flex items-center gap-2.5 px-2 py-1">
          {me.user?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small Google avatar; no need for the image optimiser
            <img src={me.user.picture} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" />
          ) : (
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-ink text-[13px] font-semibold text-white">
              {initials}
            </span>
          )}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{name}</span>
            {me.user?.email && <span className="truncate text-xs text-muted">{me.user.email}</span>}
          </span>
        </div>
      )}
      <div className="flex gap-1">
        {me.user?.role === "owner" && (
          <Link href="/admin" aria-current={path === "/admin" ? "page" : undefined} className="flex min-h-9 items-center rounded-lg px-3 text-[13px] font-medium text-muted hover:text-ink">
            People
          </Link>
        )}
        {me.canSignOut && (
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              onSignOut();
            }}
            className="min-h-9 px-3 text-[13px] font-medium text-muted hover:text-ink"
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}

function AppGroup({ label, apps, path, empty }: { label: string; apps: AppRow[]; path: string; empty?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="mb-1 px-3 font-mono text-[11px] tracking-[0.08em] text-faint uppercase">{label}</p>
      {apps.length === 0 && empty && <p className="px-3 py-1 text-sm leading-relaxed text-muted">{empty}</p>}
      {apps.map((a) => {
        const current = path.startsWith(`/apps/${a.id}`);
        const reached = TRACK.findIndex((t) => t.status === a.reached);
        return (
          <Link
            key={a.id}
            href={`/apps/${a.id}`}
            aria-current={current ? "page" : undefined}
            className={cx("flex flex-col gap-0.5 rounded-[10px] px-3 py-2.5", current ? "bg-[#e4e7ec]" : "hover:bg-black/[0.04]", a.closed && !current && "opacity-75")}
          >
            <span className="text-[15px] leading-snug font-semibold">{a.title}</span>
            {a.company && <span className="text-[13px] text-muted">{a.company}</span>}
            <span className="mt-1 flex items-center gap-2">
              <span aria-hidden="true" className="grid w-20 shrink-0 grid-cols-5 gap-[3px]">
                {TRACK.map((t, i) => (
                  <span key={t.status} className={cx("h-1 rounded-sm", i <= reached ? (a.closed ? "bg-[#8a909a]" : "bg-accent") : "bg-line")} />
                ))}
              </span>
              <span className="text-xs text-ink-2">
                {a.statusLabel} · {shortDate(a.dateLabelAt)}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
