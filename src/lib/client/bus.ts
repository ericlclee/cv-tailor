"use client";

import { useEffect } from "react";

// A tiny event bus so the activity feed, document and sidebar stay in sync.

const REFRESH = "cv:refresh";

/** Tell every panel that data changed. */
export const emitRefresh = () => window.dispatchEvent(new Event(REFRESH));

export function useRefresh(cb: () => void) {
  useEffect(() => {
    window.addEventListener(REFRESH, cb);
    return () => window.removeEventListener(REFRESH, cb);
  }, [cb]);
}

// Which CV version the open application shows, so the sidebar can say so and take
// you back to the latest. null means the latest.

const GO_TO_VERSION = "cv:go-to-version";
const VIEWING = "cv:viewing";

export type Viewing = { appId: string; n: number | null };

/** Ask the open application to show CV version `n` (null: the latest). */
export const goToVersion = (n: number | null) => window.dispatchEvent(new CustomEvent<number | null>(GO_TO_VERSION, { detail: n }));

export function useGoToVersion(cb: (n: number | null) => void) {
  useEffect(() => {
    const listener = (e: Event) => cb((e as CustomEvent<number | null>).detail);
    window.addEventListener(GO_TO_VERSION, listener);
    return () => window.removeEventListener(GO_TO_VERSION, listener);
  }, [cb]);
}

/** Say which version the open application is showing. */
export const announceViewing = (v: Viewing) => window.dispatchEvent(new CustomEvent<Viewing>(VIEWING, { detail: v }));

export function useViewing(cb: (v: Viewing) => void) {
  useEffect(() => {
    const listener = (e: Event) => cb((e as CustomEvent<Viewing>).detail);
    window.addEventListener(VIEWING, listener);
    return () => window.removeEventListener(VIEWING, listener);
  }, [cb]);
}
