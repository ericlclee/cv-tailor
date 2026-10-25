// Copy your local CV Tailor data (./data/cv-tailor.db) into a Postgres database such as Supabase.
// Usage: DATABASE_URL="postgres://..." node scripts/copy-to-postgres.mjs
// Existing rows with the same ids are overwritten; nothing is deleted.
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to your Supabase connection string first.");
  process.exit(1);
}
const file = path.resolve(process.env.DATABASE_PATH ?? "data/cv-tailor.db");
const local = new DatabaseSync(file, { readOnly: true });
const isLocalPg = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const sql = postgres(url, { prepare: false, ssl: isLocalPg ? false : "require", onnotice: () => {} });
const collections = ["entries", "jobs", "cvs", "suggestions", "activity"];

await sql.unsafe("CREATE SCHEMA IF NOT EXISTS cv_tailor");
for (const c of collections) {
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS cv_tailor.${c} (id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
}
await sql.unsafe("CREATE TABLE IF NOT EXISTS cv_tailor.kv (key text PRIMARY KEY, value jsonb NOT NULL)");

const has = (t) => local.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
for (const c of collections) {
  if (!has(c)) continue;
  const rows = local.prepare(`SELECT id, data, created_at FROM ${c}`).all();
  for (const r of rows) {
    await sql.unsafe(`INSERT INTO cv_tailor.${c} (id, data, created_at) VALUES ($1, $2::jsonb, $3) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [r.id, JSON.parse(r.data), r.created_at]);
  }
  console.log(`${c}: ${rows.length}`);
}
if (has("kv")) {
  const rows = local.prepare("SELECT key, value FROM kv").all();
  for (const r of rows) {
    await sql.unsafe("INSERT INTO cv_tailor.kv (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [r.key, JSON.parse(r.value)]);
  }
  console.log(`settings: ${rows.length}`);
}
await sql.end();
console.log("Done.");
