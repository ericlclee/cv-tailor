"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

type Toast = { id: number; message: string; tone: "error" | "success" };
let listeners: ((t: Toast) => void)[] = [];
let seq = 0;

export function toast(message: string, tone: Toast["tone"] = "success") {
  const t = { id: ++seq, message, tone };
  listeners.forEach((l) => l(t));
}
export const toastError = (err: unknown) => toast(err instanceof Error ? err.message : String(err), "error");

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const l = (t: Toast) => {
      setItems((s) => [...s, t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), t.tone === "error" ? 7000 : 3000);
    };
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            "pointer-events-auto rounded-md px-3 py-2 text-sm shadow-lg",
            t.tone === "error" ? "bg-danger text-white" : "bg-ink text-white",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
