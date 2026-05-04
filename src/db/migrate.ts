/**
 * Run with: pnpm db:migrate
 *
 * Two modes:
 *   - External Postgres (default): connects via DATABASE_URL.
 *   - Embedded PGlite (OPENCOPY_EMBEDDED_DB=1 + OPENCOPY_DATA_DIR=…):
 *     opens the local PGlite store and applies migrations in-process.
 *     Used by the Tauri shell on first launch.
 *
 * Both paths:
 *   1. Ensure the pgvector extension is installed.
 *   2. Apply all pending SQL migrations in /drizzle.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";

async function runEmbedded() {
  const dataDir = process.env.OPENCOPY_DATA_DIR;
  if (!dataDir) {
    throw new Error("OPENCOPY_DATA_DIR is not set");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite/vector");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const client = new PGlite(dataDir, { extensions: { vector } });
  await client.waitReady;
  const db = drizzle(client);

  console.log("Ensuring pgvector extension…");
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await client.close();
}

async function runExternal() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { Pool } = await import("pg");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log("Ensuring pgvector extension…");
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  } catch (err) {
    console.error(
      "Failed to create pgvector extension. If you're using stock postgres:16, " +
        "switch your DATABASE_URL to a pgvector-enabled instance (Neon, Supabase, " +
        "or the pgvector/pgvector:pg16 docker image).",
    );
    throw err;
  }

  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await pool.end();
}

async function main() {
  if (process.env.OPENCOPY_EMBEDDED_DB === "1") {
    await runEmbedded();
  } else {
    await runExternal();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
