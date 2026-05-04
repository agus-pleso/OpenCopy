import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __opencopyDb:
    | { db: unknown; pool: unknown; embedded: boolean }
    | undefined;
}

/**
 * Two database backends share the same Drizzle query surface:
 *
 *   - **External Postgres** (default): `pg.Pool` + `drizzle-orm/node-postgres`.
 *     Used in development against Docker Postgres / Neon / Supabase. The
 *     pool is constructed lazily — a missing DATABASE_URL doesn't throw
 *     here so `next build` can succeed without a live DB.
 *
 *   - **Embedded PGlite** (`OPENCOPY_EMBEDDED_DB=1`): in-process Postgres
 *     compiled to WASM, with the pgvector extension preloaded. Data persists
 *     under `OPENCOPY_DATA_DIR`. Used by the bundled Tauri installer so
 *     colleagues don't need to install Postgres separately.
 *
 * Both paths expose the same `db` and `pool` exports. Caller code should
 * treat `pool` as opaque — it's a `pg.Pool` in one mode and a `PGlite`
 * client in the other.
 */
async function create(): Promise<{
  db: unknown;
  pool: unknown;
  embedded: boolean;
}> {
  const useEmbedded = process.env.OPENCOPY_EMBEDDED_DB === "1";

  if (useEmbedded) {
    const dataDir = process.env.OPENCOPY_DATA_DIR;
    if (!dataDir) {
      throw new Error(
        "OPENCOPY_DATA_DIR must be set when OPENCOPY_EMBEDDED_DB=1",
      );
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const { vector } = await import("@electric-sql/pglite/vector");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite(dataDir, { extensions: { vector } });
    return {
      db: drizzle(client, { schema }),
      pool: client,
      embedded: true,
    };
  }

  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });
  return {
    db: drizzle(pool, { schema }),
    pool,
    embedded: false,
  };
}

const cached = global.__opencopyDb ?? (await create());
if (process.env.NODE_ENV !== "production") {
  global.__opencopyDb = cached;
}

// The two Drizzle adapters share the same query API but have different
// generic types — cast through `unknown` so call-sites get the typed
// node-postgres shape (which `@auth/drizzle-adapter` and our handlers use).
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
export const db = cached.db as NodePgDatabase<typeof schema>;
export const pool = cached.pool;
export const embedded = cached.embedded;
