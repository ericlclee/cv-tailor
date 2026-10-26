import "server-only";
import fs from "node:fs";
import path from "node:path";
import { attachDatabasePool } from "@vercel/functions";
import { customAlphabet } from "nanoid";
import pg from "pg";
import { LOCAL_USER_ID, sessionUser, SignInRequired } from "./session";
import type { Activity, Approval, CvDraft, Entry, Job, Profile, Skill, Suggestion, User } from "./types";

// A small document store. Each collection is a table of JSON documents, which
// keeps the schema flexible while the product changes. Every document and setting
// belongs to one user (user_id); the exported functions only ever see the current
// user's data (see session.ts). Users and approvals are global.
//
// Where the data lives:
// - DATABASE_URL: a Postgres database, e.g. Supabase. Required on Vercel, whose
//   filesystem doesn't keep files between requests. Tables live in their own
//   "cv_tailor" schema, which Supabase doesn't expose through its public API.
// - Otherwise a local SQLite file, DATABASE_PATH or ./data/cv-tailor.db.

const COLLECTIONS = ["entries", "jobs", "cvs", "suggestions", "activity"] as const;
export type Collection = (typeof COLLECTIONS)[number];
const GLOBALS = ["users", "invites"] as const;
type Global = (typeof GLOBALS)[number];

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

/** What each backend provides. Table names come from the constants above, never from input. */
interface Store {
  list(u: string, c: Collection): Promise<unknown[]>;
  get(u: string, c: Collection, id: string): Promise<unknown | null>;
  put(u: string, c: Collection, id: string, doc: unknown): Promise<void>;
  remove(u: string, c: Collection, id: string): Promise<void>;
  kvGet(u: string, key: string): Promise<unknown | undefined>;
  kvSet(u: string, key: string, value: unknown): Promise<void>;
  /** Largest value of a top-level string field (used to poll for changes). */
  maxField(u: string, c: Collection, field: string): Promise<string>;
  globalList(t: Global): Promise<unknown[]>;
  globalGet(t: Global, id: string): Promise<unknown | null>;
  globalPut(t: Global, id: string, doc: unknown): Promise<void>;
  globalRemove(t: Global, id: string): Promise<void>;
  /** Give data without an owner (from before accounts, or local mode) to a user. */
  claimUnowned(u: string): Promise<void>;
  /** Delete everything a user owns. */
  deleteUserData(u: string): Promise<void>;
}

// Settings are stored per user as "<user id>:<name>".
const kvKey = (u: string, key: string) => `${u}:${key}`;
const field = (f: string) => f.replace(/[^a-zA-Z0-9_]/g, "");

// ---------------------------------------------------------------------------
// Postgres (Supabase)

// Connection errors worth one retry on a fresh connection. A pooled socket can die
// while Vercel has the function frozen; without a timeout the next query on it hangs.
const RETRYABLE = /timeout|terminated|ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|Connection ended|not queryable/i;

async function postgresStore(url: string): Promise<Store> {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // pg lets SSL settings in the URL override the ssl option, so they're removed and set
  // here: encrypted, without checking the certificate (Supabase uses its own authority).
  const connectionString = url.replace(/([?&])(sslmode|ssl|sslrootcert|uselibpqcompat)=[^&]*&?/g, "$1").replace(/[?&]$/, "");
  const pool = new pg.Pool({
    connectionString,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    query_timeout: 5000,
    keepAlive: true,
  });
  // A dropped idle connection must not crash the process.
  pool.on("error", () => {});
  // On Vercel, close idle connections before the function is suspended.
  attachDatabasePool(pool);

  // jsonb values are sent as JSON text (pg would turn a top-level array into a Postgres array).
  const query = async (text: string, params: unknown[] = []) => {
    try {
      return (await pool.query(text, params)).rows;
    } catch (err) {
      if (!RETRYABLE.test(String((err as Error).message))) throw err;
      // The pool has discarded the broken connection; the retry gets a new one.
      return (await pool.query(text, params)).rows;
    }
  };

  // The users table is created last, so its presence means the schema is current.
  const [{ ready }] = await query("SELECT to_regclass('cv_tailor.users') IS NOT NULL AS ready");
  const s: Store = {
    list: async (u, c) => (await query(`SELECT data FROM cv_tailor.${c} WHERE user_id = $1 ORDER BY created_at DESC`, [u])).map((r) => r.data),
    get: async (u, c, id) => (await query(`SELECT data FROM cv_tailor.${c} WHERE id = $1 AND user_id = $2`, [id, u]))[0]?.data ?? null,
    put: async (u, c, id, doc) => {
      // The WHERE keeps one user from overwriting another's document with the same id.
      await query(`INSERT INTO cv_tailor.${c} AS t (id, user_id, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data WHERE t.user_id = EXCLUDED.user_id`, [id, u, JSON.stringify(doc)]);
    },
    remove: async (u, c, id) => {
      await query(`DELETE FROM cv_tailor.${c} WHERE id = $1 AND user_id = $2`, [id, u]);
    },
    kvGet: async (u, key) => (await query("SELECT value FROM cv_tailor.kv WHERE key = $1", [kvKey(u, key)]))[0]?.value,
    kvSet: async (u, key, value) => {
      await query("INSERT INTO cv_tailor.kv (key, user_id, value) VALUES ($1, $2, $3::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [kvKey(u, key), u, JSON.stringify(value)]);
    },
    maxField: async (u, c, f) => String((await query(`SELECT max(data->>'${field(f)}') AS m FROM cv_tailor.${c} WHERE user_id = $1`, [u]))[0]?.m ?? ""),
    globalList: async (t) => (await query(`SELECT data FROM cv_tailor.${t} ORDER BY created_at`)).map((r) => r.data),
    globalGet: async (t, id) => (await query(`SELECT data FROM cv_tailor.${t} WHERE id = $1`, [id]))[0]?.data ?? null,
    globalPut: async (t, id, doc) => {
      await query(`INSERT INTO cv_tailor.${t} (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [id, JSON.stringify(doc)]);
    },
    globalRemove: async (t, id) => {
      await query(`DELETE FROM cv_tailor.${t} WHERE id = $1`, [id]);
    },
    claimUnowned: async (u) => {
      for (const c of COLLECTIONS) await query(`UPDATE cv_tailor.${c} SET user_id = $1 WHERE user_id IS NULL OR user_id = $2`, [u, LOCAL_USER_ID]);
      // Settings from before accounts have no "<user>:" prefix; local-mode ones use "local:".
      await query(`UPDATE cv_tailor.kv SET key = $1 || ':' || key, user_id = $1 WHERE user_id IS NULL AND position(':' in key) = 0`, [u]);
      await query(`UPDATE cv_tailor.kv SET key = $1 || substr(key, length($2) + 1), user_id = $1 WHERE user_id = $2 AND NOT EXISTS (SELECT 1 FROM cv_tailor.kv k WHERE k.key = $1 || substr(cv_tailor.kv.key, length($2) + 1))`, [u, LOCAL_USER_ID]);
    },
    deleteUserData: async (u) => {
      for (const c of COLLECTIONS) await query(`DELETE FROM cv_tailor.${c} WHERE user_id = $1`, [u]);
      await query("DELETE FROM cv_tailor.kv WHERE user_id = $1", [u]);
    },
  };
  if (!ready) {
    const ddl = [
      "CREATE SCHEMA IF NOT EXISTS cv_tailor",
      ...COLLECTIONS.flatMap((c) => [
        `CREATE TABLE IF NOT EXISTS cv_tailor.${c} (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
        `ALTER TABLE cv_tailor.${c} ADD COLUMN IF NOT EXISTS user_id text`,
        `CREATE INDEX IF NOT EXISTS ${c}_user_idx ON cv_tailor.${c} (user_id)`,
      ]),
      "CREATE TABLE IF NOT EXISTS cv_tailor.kv (key text PRIMARY KEY, value jsonb NOT NULL)",
      "ALTER TABLE cv_tailor.kv ADD COLUMN IF NOT EXISTS user_id text",
      "CREATE TABLE IF NOT EXISTS cv_tailor.invites (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())",
    ];
    for (const stmt of ddl) {
      try {
        await query(stmt);
      } catch (err) {
        // Two cold starts creating the same table at once: the other one won.
        const code = (err as { code?: string }).code;
        if (!["42P06", "42P07", "23505", "42701"].includes(code ?? "")) throw err;
      }
    }
    // Data from before users existed belongs to the local user until the owner claims it.
    await s.claimUnowned(LOCAL_USER_ID);
    await query("CREATE TABLE IF NOT EXISTS cv_tailor.users (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())");
  }
  return s;
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
  const hasColumn = (t: string, col: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((r) => r.name === col);
  let migrated = false;
  for (const c of COLLECTIONS) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${c} (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL)`);
    if (!hasColumn(c, "user_id")) {
      db.exec(`ALTER TABLE ${c} ADD COLUMN user_id TEXT`);
      migrated = true;
    }
    db.exec(`CREATE INDEX IF NOT EXISTS ${c}_user_idx ON ${c} (user_id)`);
  }
  db.exec("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  if (!hasColumn("kv", "user_id")) db.exec("ALTER TABLE kv ADD COLUMN user_id TEXT");
  for (const t of GLOBALS) db.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL)`);

  const one = (q: string, ...args: string[]) => db.prepare(q).get(...args) as Record<string, string> | undefined;
  const now = () => new Date().toISOString();
  const s: Store = {
    list: async (u, c) => (db.prepare(`SELECT data FROM ${c} WHERE user_id = ? ORDER BY created_at DESC`).all(u) as { data: string }[]).map((r) => JSON.parse(r.data)),
    get: async (u, c, id) => {
      const r = one(`SELECT data FROM ${c} WHERE id = ? AND user_id = ?`, id, u);
      return r ? JSON.parse(r.data) : null;
    },
    put: async (u, c, id, doc) => {
      db.prepare(`INSERT INTO ${c} (id, user_id, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data WHERE ${c}.user_id = excluded.user_id`).run(id, u, JSON.stringify(doc), now());
    },
    remove: async (u, c, id) => {
      db.prepare(`DELETE FROM ${c} WHERE id = ? AND user_id = ?`).run(id, u);
    },
    kvGet: async (u, key) => {
      const r = one("SELECT value FROM kv WHERE key = ?", kvKey(u, key));
      return r ? JSON.parse(r.value) : undefined;
    },
    kvSet: async (u, key, value) => {
      db.prepare("INSERT INTO kv (key, user_id, value) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(kvKey(u, key), u, JSON.stringify(value));
    },
    maxField: async (u, c, f) => one(`SELECT MAX(json_extract(data, '$.${field(f)}')) AS m FROM ${c} WHERE user_id = ?`, u)?.m ?? "",
    globalList: async (t) => (db.prepare(`SELECT data FROM ${t} ORDER BY created_at`).all() as { data: string }[]).map((r) => JSON.parse(r.data)),
    globalGet: async (t, id) => {
      const r = one(`SELECT data FROM ${t} WHERE id = ?`, id);
      return r ? JSON.parse(r.data) : null;
    },
    globalPut: async (t, id, doc) => {
      db.prepare(`INSERT INTO ${t} (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`).run(id, JSON.stringify(doc), now());
    },
    globalRemove: async (t, id) => {
      db.prepare(`DELETE FROM ${t} WHERE id = ?`).run(id);
    },
    claimUnowned: async (u) => {
      for (const c of COLLECTIONS) db.prepare(`UPDATE ${c} SET user_id = ? WHERE user_id IS NULL OR user_id = ?`).run(u, LOCAL_USER_ID);
      db.prepare("UPDATE kv SET key = ? || ':' || key, user_id = ? WHERE user_id IS NULL AND instr(key, ':') = 0").run(u, u);
      db.prepare("UPDATE OR IGNORE kv SET key = ? || substr(key, length(?) + 1), user_id = ? WHERE user_id = ?").run(u, LOCAL_USER_ID, u, LOCAL_USER_ID);
    },
    deleteUserData: async (u) => {
      for (const c of COLLECTIONS) db.prepare(`DELETE FROM ${c} WHERE user_id = ?`).run(u);
      db.prepare("DELETE FROM kv WHERE user_id = ?").run(u);
    },
  };
  // Data from before users existed belongs to the local user until the owner claims it.
  if (migrated) await s.claimUnowned(LOCAL_USER_ID);
  return s;
}

// ---------------------------------------------------------------------------

const globalForDb = globalThis as unknown as { __cvStoreV2?: Promise<Store> };

/** One store per server process (it also survives dev hot reloads). */
function store(): Promise<Store> {
  globalForDb.__cvStoreV2 ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (url) return postgresStore(url);
    if (process.env.VERCEL) throw new Error("Set DATABASE_URL to your Supabase connection string: Vercel can't store a local database file.");
    return sqliteStore();
  })().catch((err) => {
    globalForDb.__cvStoreV2 = undefined;
    throw err;
  });
  return globalForDb.__cvStoreV2;
}

// Signed-in users are checked against the users table, so removing someone takes
// effect at once rather than when their cookie expires. Results are cached briefly.
const known = new Map<string, number>();

/** The current user's id; throws SignInRequired if there isn't one. */
export async function currentUserId(): Promise<string> {
  const { id, checked } = await sessionUser();
  if (checked) return id;
  if ((known.get(id) ?? 0) > Date.now()) return id;
  const user = await (await store()).globalGet("users", id);
  if (!user) throw new SignInRequired();
  known.set(id, Date.now() + 60_000);
  return id;
}

const scoped = async () => [await store(), await currentUserId()] as const;

export async function list<C extends Collection>(c: C): Promise<DocFor<C>[]> {
  const [s, u] = await scoped();
  return s.list(u, c) as Promise<DocFor<C>[]>;
}

export async function get<C extends Collection>(c: C, id: string): Promise<DocFor<C> | null> {
  const [s, u] = await scoped();
  return (await s.get(u, c, id)) as DocFor<C> | null;
}

export async function put<C extends Collection>(c: C, doc: DocFor<C>): Promise<DocFor<C>> {
  const [s, u] = await scoped();
  await s.put(u, c, doc.id, doc);
  return doc;
}

export async function remove(c: Collection, id: string) {
  const [s, u] = await scoped();
  await s.remove(u, c, id);
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const [s, u] = await scoped();
  const v = await s.kvGet(u, key);
  return v === undefined ? fallback : (v as T);
}

export async function kvSet(key: string, value: unknown) {
  const [s, u] = await scoped();
  await s.kvSet(u, key, value);
}

/** The largest value of a top-level JSON field across a collection (cheap enough to poll). */
export async function maxField(c: Collection, field: string): Promise<string> {
  const [s, u] = await scoped();
  return s.maxField(u, c, field);
}

// Users and approved emails (not scoped to the current user). Used by users.ts.

export const users = {
  list: async () => (await (await store()).globalList("users")) as User[],
  get: async (id: string) => (await (await store()).globalGet("users", id)) as User | null,
  put: async (u: User) => {
    await (await store()).globalPut("users", u.id, u);
    known.delete(u.id);
    return u;
  },
  /** Removes the user and everything they own. */
  remove: async (id: string) => {
    const s = await store();
    await s.deleteUserData(id);
    await s.globalRemove("users", id);
    known.delete(id);
  },
  claimUnowned: async (id: string) => (await store()).claimUnowned(id),
};

// Approvals live in the "invites" table, named for the invite links they replaced.
export const approvals = {
  list: async () => (await (await store()).globalList("invites")) as Approval[],
  get: async (email: string) => (await (await store()).globalGet("invites", email)) as Approval | null,
  put: async (a: Approval) => {
    await (await store()).globalPut("invites", a.id, a);
    return a;
  },
  remove: async (email: string) => (await store()).globalRemove("invites", email),
};

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
