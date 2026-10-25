import "server-only";
import fs from "node:fs";
import path from "node:path";
import { customAlphabet } from "nanoid";
import postgres from "postgres";
import type { Activity, CvDraft, Entry, Job, Profile, Skill, Suggestion } from "./types";

// A small document store. Each collection is a table of JSON documents, which
// keeps the schema flexible while the product changes.
//
// Where the data lives:
// - DATABASE_URL: a Postgres database, e.g. Supabase. Required on Vercel, whose
//   filesystem doesn't keep files between requests. Tables live in their own
//   "cv_tailor" schema, which Supabase doesn't expose through its public API.
// - Otherwise a local SQLite file, DATABASE_PATH or ./data/cv-tailor.db.

const COLLECTIONS = ["entries", "jobs", "cvs", "suggestions", "activity"] as const;
export type Collection = (typeof COLLECTIONS)[number];

type DocFor<C extends Collection> = C extends "entries"
  ? Entry
  : C extends "jobs"
    ? Job
    : C extends "cvs"
      ? CvDraft
      : C extends "suggestions"
        ? Suggestion
        : Activity;

export const newId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

/** What each backend provides. Collection names come from COLLECTIONS, never from input. */
interface Store {
  list(c: Collection): Promise<unknown[]>;
  get(c: Collection, id: string): Promise<unknown | null>;
  put(c: Collection, id: string, doc: unknown): Promise<void>;
  remove(c: Collection, id: string): Promise<void>;
  kvGet(key: string): Promise<unknown | undefined>;
  kvSet(key: string, value: unknown): Promise<void>;
  /** Largest value of a top-level string field (used to poll for changes). */
  maxField(c: Collection, field: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Postgres (Supabase)

async function postgresStore(url: string): Promise<Store> {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // prepare: false is required by Supabase's transaction pooler (port 6543), which suits serverless.
  // jsonb parameters are passed as objects: the driver serialises them once.
  const sql = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 15, ssl: local ? false : "require", onnotice: () => {} });
  const ddl = [
    "CREATE SCHEMA IF NOT EXISTS cv_tailor",
    ...COLLECTIONS.map((c) => `CREATE TABLE IF NOT EXISTS cv_tailor.${c} (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`),
    "CREATE TABLE IF NOT EXISTS cv_tailor.kv (key text PRIMARY KEY, value jsonb NOT NULL)",
  ];
  for (const stmt of ddl) {
    try {
      await sql.unsafe(stmt);
    } catch (err) {
      // Two cold starts creating the same table at once: the other one won.
      const code = (err as { code?: string }).code;
      if (!["42P06", "42P07", "23505"].includes(code ?? "")) throw err;
    }
  }
  const field = (f: string) => f.replace(/[^a-zA-Z0-9_]/g, "");
  return {
    list: async (c) => (await sql.unsafe(`SELECT data FROM cv_tailor.${c} ORDER BY created_at DESC`)).map((r) => r.data),
    get: async (c, id) => (await sql.unsafe(`SELECT data FROM cv_tailor.${c} WHERE id = $1`, [id]))[0]?.data ?? null,
    put: async (c, id, doc) => {
      await sql.unsafe(`INSERT INTO cv_tailor.${c} (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [id, doc as postgres.JSONValue]);
    },
    remove: async (c, id) => {
      await sql.unsafe(`DELETE FROM cv_tailor.${c} WHERE id = $1`, [id]);
    },
    kvGet: async (key) => (await sql.unsafe("SELECT value FROM cv_tailor.kv WHERE key = $1", [key]))[0]?.value,
    kvSet: async (key, value) => {
      await sql.unsafe("INSERT INTO cv_tailor.kv (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, value as postgres.JSONValue]);
    },
    maxField: async (c, f) => String((await sql.unsafe(`SELECT max(data->>'${field(f)}') AS m FROM cv_tailor.${c}`))[0]?.m ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Local SQLite file (Node's built-in driver; never used on Vercel)

async function sqliteStore(): Promise<Store> {
  const { DatabaseSync } = await import("node:sqlite");
  // Ignored by the build tracer so a deployment doesn't bundle the whole project.
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "cv-tailor.db"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  for (const c of COLLECTIONS) db.exec(`CREATE TABLE IF NOT EXISTS ${c} (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL)`);
  db.exec("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const one = (q: string, ...args: string[]) => db.prepare(q).get(...args) as Record<string, string> | undefined;
  const field = (f: string) => f.replace(/[^a-zA-Z0-9_]/g, "");
  return {
    list: async (c) => (db.prepare(`SELECT data FROM ${c} ORDER BY created_at DESC`).all() as { data: string }[]).map((r) => JSON.parse(r.data)),
    get: async (c, id) => {
      const r = one(`SELECT data FROM ${c} WHERE id = ?`, id);
      return r ? JSON.parse(r.data) : null;
    },
    put: async (c, id, doc) => {
      db.prepare(`INSERT INTO ${c} (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`).run(id, JSON.stringify(doc), new Date().toISOString());
    },
    remove: async (c, id) => {
      db.prepare(`DELETE FROM ${c} WHERE id = ?`).run(id);
    },
    kvGet: async (key) => {
      const r = one("SELECT value FROM kv WHERE key = ?", key);
      return r ? JSON.parse(r.value) : undefined;
    },
    kvSet: async (key, value) => {
      db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
    },
    maxField: async (c, f) => one(`SELECT MAX(json_extract(data, '$.${field(f)}')) AS m FROM ${c}`)?.m ?? "",
  };
}

// ---------------------------------------------------------------------------

const globalForDb = globalThis as unknown as { __cvStore?: Promise<Store> };

/** One store per server process (it also survives dev hot reloads). */
function store(): Promise<Store> {
  globalForDb.__cvStore ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (url) return postgresStore(url);
    if (process.env.VERCEL) throw new Error("Set DATABASE_URL to your Supabase connection string: Vercel can't store a local database file.");
    return sqliteStore();
  })().catch((err) => {
    globalForDb.__cvStore = undefined;
    throw err;
  });
  return globalForDb.__cvStore;
}

export async function list<C extends Collection>(c: C): Promise<DocFor<C>[]> {
  return (await store()).list(c) as Promise<DocFor<C>[]>;
}

export async function get<C extends Collection>(c: C, id: string): Promise<DocFor<C> | null> {
  return (await (await store()).get(c, id)) as DocFor<C> | null;
}

export async function put<C extends Collection>(c: C, doc: DocFor<C>): Promise<DocFor<C>> {
  await (await store()).put(c, doc.id, doc);
  return doc;
}

export async function remove(c: Collection, id: string) {
  await (await store()).remove(c, id);
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const v = await (await store()).kvGet(key);
  return v === undefined ? fallback : (v as T);
}

export async function kvSet(key: string, value: unknown) {
  await (await store()).kvSet(key, value);
}

export const EMPTY_PROFILE: Profile = {
  name: "",
  headline: "",
  email: "",
  phone: "",
  location: "",
  links: [],
  summary: "",
};

export const getProfile = async () => ({ ...EMPTY_PROFILE, ...(await kvGet<Partial<Profile>>("profile", {})) });
export const setProfile = (p: Profile) => kvSet("profile", p);
export const getSkills = () => kvGet<Skill[]>("skills", []);
export const setSkills = (s: Skill[]) => kvSet("skills", s);

/** Entries in display order: current first, then by most recent start date. */
export async function listEntries(): Promise<Entry[]> {
  return (await list("entries")).sort((a, b) => {
    if (a.sort !== b.sort) return a.sort - b.sort;
    if (a.current !== b.current) return a.current ? -1 : 1;
    return (b.startDate || "").localeCompare(a.startDate || "");
  });
}

export async function getMaster() {
  const [profile, entries, skills] = await Promise.all([getProfile(), listEntries(), getSkills()]);
  return { profile, entries, skills };
}
export type Master = Awaited<ReturnType<typeof getMaster>>;

/** The largest value of a top-level JSON field across a collection (cheap enough to poll). */
export async function maxField(c: Collection, field: string): Promise<string> {
  return (await store()).maxField(c, field);
}
