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
