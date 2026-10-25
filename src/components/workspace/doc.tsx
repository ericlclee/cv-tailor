"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "../ui";

// Layout pieces for the middle panel.

export function DocPanel({ children }: { children: ReactNode }) {
  return <main className="flex w-full min-w-0 flex-col bg-paper lg:h-full lg:flex-1 lg:overflow-y-auto">{children}</main>;
}

export function DocBar({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-line-soft bg-surface px-7 py-2.5">
      <h1 className="py-1.5 text-[17px] font-semibold">{title}</h1>
      <span className="flex-1" />
      {children}
    </div>
  );
}

export function DocBody({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex justify-center px-4 py-7 sm:px-7">
      <div className={cx("flex w-full flex-col gap-4", wide ? "max-w-[820px]" : "max-w-[760px]")}>{children}</div>
    </div>
  );
}

export function Tabs({ base, active, tabs }: { base: string; active: string; tabs: { key: string; label: string }[] }) {
  return (
    <nav aria-label="Application views" className="flex gap-0.5 rounded-[10px] bg-paper p-[3px]">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === tabs[0].key ? base : `${base}?tab=${t.key}`}
          aria-current={active === t.key ? "page" : undefined}
          className={cx("rounded-lg px-3.5 py-2 text-sm", active === t.key ? "bg-surface font-semibold shadow-[0_1px_2px_rgba(14,17,22,0.08)]" : "font-medium text-ink-2 hover:text-ink")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Meter({ value }: { value: number }) {
  return (
    <div aria-hidden="true" className="h-2 w-28 rounded bg-line-soft">
      <div className="h-2 rounded bg-accent transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="font-mono text-[11px] tracking-[0.08em] text-faint uppercase">{children}</p>
);
