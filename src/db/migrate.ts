/**
 * Run with: pnpm db:migrate
 *
 * Steps:
 *   1. Ensure the pgvector extension is installed (idempotent).
 *   2. Apply all pending SQL migrations in /drizzle.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
