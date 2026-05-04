// Smoke test: spin up an ephemeral PGlite instance with the vector extension,
// apply all drizzle migrations, and exercise the vector type. Validates that
// our schema is compatible with PGlite before wiring it into the bundled
// Tauri runtime.

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "opencopy-pglite-test-"));
console.log(`temp data dir: ${dataDir}`);

const client = new PGlite(dataDir, { extensions: { vector } });
await client.waitReady;

console.log("→ creating vector extension");
await client.exec("CREATE EXTENSION IF NOT EXISTS vector");

const db = drizzle(client);

console.log("→ running migrations");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("✓ migrations applied");

console.log("→ enumerate public schema");
const tables = await db.execute(
  sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
);
console.log(
  `✓ ${tables.rows.length} tables: ${tables.rows.map((r) => r.tablename).join(", ")}`,
);

console.log("→ vector type round-trip");
const v = Array.from({ length: 1536 }, () => Math.random());
const vlit = `[${v.join(",")}]`;
const r = await db.execute(
  sql`SELECT (${vlit}::vector <=> ${vlit}::vector) AS dist`,
);
console.log(`✓ self-distance = ${r.rows[0].dist} (expected ~0)`);

const r2 = await db.execute(
  sql`SELECT pg_catalog.array_agg(extname) AS exts FROM pg_extension`,
);
console.log(`✓ installed extensions: ${JSON.stringify(r2.rows[0].exts)}`);

await client.close();
rmSync(dataDir, { recursive: true, force: true });
console.log("✓ pglite smoke test passed");
