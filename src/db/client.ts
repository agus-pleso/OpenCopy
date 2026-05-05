import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

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
 * client in the other. Eager-initialised so the module has no top-level
 * await; both adapters are listed in `serverExternalPackages` so the
 * unused one isn't bundled at runtime.
 */
function create(): { db: unknown; pool: unknown; embedded: boolean } {
  const useEmbedded = process.env.OPENCOPY_EMBEDDED_DB === "1";

  if (useEmbedded) {
    const dataDir = process.env.OPENCOPY_DATA_DIR;
    if (!dataDir) {
      throw new Error(
        "OPENCOPY_DATA_DIR must be set when OPENCOPY_EMBEDDED_DB=1",
      );
    }
    const client = new PGlite(dataDir, { extensions: { vector } });
    return {
      db: drizzlePglite(client, { schema }),
      pool: client,
      embedded: true,
    };
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });
  return {
    db: drizzlePg(pool, { schema }),
    pool,
    embedded: false,
  };
}

// Always cache on globalThis. The Next.js standalone bundler can include
// `db/client.ts` in more than one webpack chunk on the server side; without
// the global handoff each chunk would call `create()` and end up with its
// own PGlite instance pointed at the same data dir. Two PGlite instances on
// one dataDir cannot share in-memory state, so writes through one chunk's
// `db` are invisible to reads through another chunk's `db` until the
// process restarts. (Symptom that surfaced this: saveApiKey returned ok
// but the row never appeared on /settings/ai re-render — Ollama specifically
// because the OpenRouter form happened to land in the same chunk as the
// page render, while Ollama's form did not.) The global cache also still
// protects against dev-mode hot-reload re-instantiation, which is what the
// original guard was for.
const cached = global.__opencopyDb ?? create();
global.__opencopyDb = cached;

// The two Drizzle adapters share the same query API but have different
// generic types — cast through `unknown` so call-sites get the typed
// node-postgres shape (which `@auth/drizzle-adapter` and our handlers use).
export const db = cached.db as NodePgDatabase<typeof schema>;
export const pool = cached.pool;
export const embedded = cached.embedded;
