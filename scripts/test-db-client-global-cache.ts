// Regression test for the "two PGlite instances on one dataDir" bug.
//
// In the bundled Next.js standalone server, src/db/client.ts gets compiled
// into multiple webpack chunks. Each compiled copy ran `create()` independently,
// so we ended up with two PGlite instances pointing at the same dataDir —
// writes through one chunk's `db` were never visible to reads through the
// other (until process restart, when both re-read disk).
//
// The fix: cache the PGlite client on `globalThis.__opencopyDb` regardless of
// NODE_ENV, so the second module copy reuses the first one's instance.
//
// This test verifies the invariant: after importing the module once, the
// global cache MUST be populated. A second simulated "module load" must reuse
// the cached instance instead of calling `create()` again.
//
//   pnpm tsx scripts/test-db-client-global-cache.ts

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

async function main() {
const dataDir = mkdtempSync(join(tmpdir(), "opencopy-cache-"));
process.env.OPENCOPY_EMBEDDED_DB = "1";
process.env.OPENCOPY_DATA_DIR = dataDir;
// Force production-like env to mirror the bundled installer's NODE_ENV.
process.env.NODE_ENV = "production";

console.log("→ pre-import: global.__opencopyDb should be undefined");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((globalThis as any).__opencopyDb !== undefined) {
  fail("global.__opencopyDb already set before import — test setup polluted");
}
console.log("✓ undefined");

console.log("\n→ first import of @/db/client");
const m1 = await import("../src/db/client");
if (!m1.db) fail("first import: db export missing");
if (!m1.pool) fail("first import: pool export missing");
console.log(`✓ first import succeeded (embedded=${m1.embedded})`);

console.log("\n→ global cache must now be populated (this is the fix)");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalCache = (globalThis as any).__opencopyDb;
if (!globalCache) {
  fail(
    "global.__opencopyDb is still undefined after import — fix not applied. " +
      "Each duplicated module copy in the bundle will create its own PGlite.",
  );
}
if (globalCache.db !== m1.db) {
  fail("global cache db does not match exported db");
}
if (globalCache.pool !== m1.pool) {
  fail("global cache pool does not match exported pool");
}
console.log("✓ global cache is populated and matches exports");

console.log("\n→ simulate second module copy: re-import via cache-bust query");
// Node ESM module cache is keyed by URL. We can't easily evict it from inside
// the same process, but we CAN verify the runtime invariant directly: a
// fresh module instance running the same `cached = global.__opencopyDb ?? create()`
// expression MUST hit the global path. Inline that expression here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fresh = (globalThis as any).__opencopyDb ?? "WOULD_HAVE_CALLED_CREATE";
if (fresh === "WOULD_HAVE_CALLED_CREATE") {
  fail(
    "a second module copy WOULD have called create() — bug still present",
  );
}
if (fresh !== globalCache) {
  fail("simulated second module copy got a different cache reference");
}
console.log("✓ a second module copy would reuse the cached instance");

console.log("\n→ writes through cached.db must be visible to subsequent reads");
// Quick functional check — write a row, read it back via the SAME db handle
// (this isn't testing two instances, just confirming the cached one works).
const { sql } = await import("drizzle-orm");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = m1.db as any;
await db.execute(sql`CREATE TABLE IF NOT EXISTS _cache_check (k text PRIMARY KEY, v text)`);
await db.execute(sql`INSERT INTO _cache_check (k, v) VALUES ('hello', 'world')`);
const r = await db.execute(sql`SELECT v FROM _cache_check WHERE k = 'hello'`);
if ((r.rows[0] as { v: string })?.v !== "world") {
  fail(`round-trip failed: ${JSON.stringify(r.rows[0])}`);
}
console.log("✓ round-trip works");

// Clean up: PGlite holds the data dir; close before rm.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await (m1.pool as any).close?.();
rmSync(dataDir, { recursive: true, force: true });

console.log("\n✓ db client global-cache invariant holds");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
