// Copy your local CV Tailor data (./data/cv-tailor.db) into a Postgres database such as Supabase.
// Usage: DATABASE_URL="postgres://..." node scripts/copy-to-postgres.mjs
// Existing rows with the same ids are overwritten; nothing is deleted. The data goes to
// the single user ("local"); when Google sign-in is turned on, the owner takes it over
// at their first sign-in.
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to your Supabase connection string first.");
  process.exit(1);
}
const file = path.resolve(process.env.DATABASE_PATH ?? "data/cv-tailor.db");
const local = new DatabaseSync(file, { readOnly: true });
const isLocalPg = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
// SSL settings in the URL would override the ssl option, so they're removed (as in src/lib/db.ts).
const connectionString = url.replace(/([?&])(sslmode|ssl|sslrootcert|uselibpqcompat)=[^&]*&?/g, "$1").replace(/[?&]$/, "");
const sql = new pg.Client({ connectionString, ssl: isLocalPg ? false : { rejectUnauthorized: false } });
await sql.connect();
const collections = ["entries", "jobs", "cvs", "suggestions", "activity"];

await sql.query("CREATE SCHEMA IF NOT EXISTS cv_tailor");
const user = "local";
for (const c of collections) {
  await sql.query(`CREATE TABLE IF NOT EXISTS cv_tailor.${c} (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await sql.query(`ALTER TABLE cv_tailor.${c} ADD COLUMN IF NOT EXISTS user_id text`);
}
await sql.query("CREATE TABLE IF NOT EXISTS cv_tailor.kv (key text PRIMARY KEY, value jsonb NOT NULL)");
await sql.query("ALTER TABLE cv_tailor.kv ADD COLUMN IF NOT EXISTS user_id text");

const has = (t) => local.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
for (const c of collections) {
  if (!has(c)) continue;
  const rows = local.prepare(`SELECT id, data, created_at FROM ${c}`).all();
  for (const r of rows) {
    await sql.query(`INSERT INTO cv_tailor.${c} (id, user_id, data, created_at) VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [r.id, user, r.data, r.created_at]);
  }
  console.log(`${c}: ${rows.length}`);
}
if (has("kv")) {
  const rows = local.prepare("SELECT key, value FROM kv").all();
  for (const r of rows) {
    await sql.query("INSERT INTO cv_tailor.kv (key, user_id, value) VALUES ($1, $2, $3::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [r.key.includes(":") ? r.key : `${user}:${r.key}`, user, r.value]);
  }
  console.log(`settings: ${rows.length}`);
}
await sql.end();
console.log("Done.");
