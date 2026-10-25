import "server-only";
import { get, kvGet, kvSet, list, maxField, newId, put, remove, type Collection } from "./db";
import { HttpError } from "./http";
import type { Activity, ActivityDetail, Snapshot } from "./types";

// Records each change with a snapshot of what it touched, so it can be undone
// from the activity feed. Undo refuses if a later change touched the same data.

const key = (s: Snapshot) => ("kv" in s ? `kv:${s.kv}` : `${s.collection}:${s.id}`);

export function tracker() {
  const snapshots: Snapshot[] = [];
  const seen = new Set<string>();
  return {
    /** Await before changing a document (or creating one: its "before" is null). */
    async doc(collection: Collection, id: string) {
      const k = `${collection}:${id}`;
      if (seen.has(k)) return;
      seen.add(k);
      snapshots.push({ collection, id, doc: await get(collection, id) });
    },
    async kv(name: "profile" | "skills") {
      const k = `kv:${name}`;
      if (seen.has(k)) return;
      seen.add(k);
      snapshots.push({ kv: name, value: await kvGet(name, null) });
    },
    record(a: { source?: Activity["source"]; kind: Activity["kind"]; summary: string; details?: ActivityDetail[]; appId?: string | null }): Promise<Activity> {
      return put("activity", {
        id: newId(),
        at: new Date().toISOString(),
        source: a.source ?? "chat",
        kind: a.kind,
        summary: a.summary,
        details: a.details ?? [],
        appId: a.appId ?? null,
        status: "applied",
        snapshots,
      });
    },
  };
}

export async function listActivity(appId?: string | null, limit = 100) {
  const all = (await list("activity")).sort((a, b) => b.at.localeCompare(a.at));
  return (appId === undefined ? all : all.filter((a) => a.appId === appId)).slice(0, limit).map(({ snapshots: _s, ...rest }) => {
    void _s;
    return rest;
  });
}

export const latestActivityAt = () => maxField("activity", "at");

export async function undoActivity(id: string) {
  const a = await get("activity", id);
  if (!a) throw new HttpError(404, "Change not found");
  if (a.status === "undone") return a;
  const keys = new Set(a.snapshots.map(key));
  const later = (await list("activity")).find((x) => x.status === "applied" && x.at > a.at && x.snapshots.some((s) => keys.has(key(s))));
  if (later) throw new HttpError(409, `A later change ("${later.summary}") touched the same data. Undo that first.`);
  for (const s of [...a.snapshots].reverse()) {
    if ("kv" in s) await kvSet(s.kv, s.value ?? (s.kv === "skills" ? [] : {}));
    else if (s.doc === null) await remove(s.collection as Collection, s.id);
    else await put(s.collection as Collection, s.doc as never);
  }
  return put("activity", { ...a, status: "undone" });
}
