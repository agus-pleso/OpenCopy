// Standalone migration runner. Tauri's Rust shell spawns this with the
// bundled Node sidecar BEFORE starting the Next.js server, so the embedded
// PGlite store is fully migrated by the time request handlers run.
//
// Lives outside the Next.js bundle on purpose — keeps `node:fs` / `fs/promises`
// out of webpack's hands. The deps it imports (`@electric-sql/pglite`,
// `drizzle-orm/pglite`) are the same ones the standalone server bundle ships,
// so resolution from the bundled `node_modules/` works.
//
// Env contract:
//   OPENCOPY_DATA_DIR   absolute path for the PGlite data directory (required)
//
// Exit codes: 0 on success, 1 on any failure (stderr has the reason).

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dataDir = process.env.OPENCOPY_DATA_DIR;
if (!dataDir) {
  console.error("OPENCOPY_DATA_DIR is required");
  process.exit(1);
}

// Migrations folder lives next to this script (prepare-server.mjs places
// both at the bundle root).
const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "drizzle");

const client = new PGlite(dataDir, { extensions: { vector } });
await client.waitReady;

await client.exec(`CREATE EXTENSION IF NOT EXISTS vector`);
await client.exec(`
  CREATE TABLE IF NOT EXISTS __opencopy_migrations (
    id serial PRIMARY KEY,
    filename text NOT NULL UNIQUE,
    applied_at bigint NOT NULL
  )
`);

const files = (await readdir(migrationsFolder))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const appliedRes = await client.query("SELECT filename FROM __opencopy_migrations");
const applied = new Set(appliedRes.rows.map((r) => r.filename));

for (const file of files) {
  if (applied.has(file)) continue;
  const sqlText = await readFile(join(migrationsFolder, file), "utf-8");
  const statements = sqlText
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await client.exec(stmt);
  }
  await client.query(
    "INSERT INTO __opencopy_migrations (filename, applied_at) VALUES ($1, $2)",
    [file, Date.now()],
  );
  console.log(`applied ${file}`);
}

await client.close();
console.log("migrations complete");
