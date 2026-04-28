import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  var __opencopyPool: Pool | undefined;
}

/**
 * Reuse a single pg.Pool across hot reloads in dev so we don't exhaust
 * Postgres connections on every code change. We accept a missing
 * DATABASE_URL at import time so `next build` succeeds without a DB —
 * the error surfaces at first query instead.
 */
const pool =
  global.__opencopyPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  global.__opencopyPool = pool;
}

export const db = drizzle(pool, { schema });
export { pool };
