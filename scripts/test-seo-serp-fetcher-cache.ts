/**
 * Smoke test the SERP fetcher's cache behavior.
 *
 *  - On first call with an empty cache, results land in seo_serp_cache.
 *  - On second call with the cache populated, fetchSerp returns the
 *    cached row without touching the network (verified by spying on
 *    the global fetch).
 *  - When the cache row is expired (expiresAt < now), fetchSerp re-
 *    fetches and updates the row.
 *
 * Uses SEO_SERP_TEST_MODE=1 with custom fixture data so we don't hit
 * Google. PGlite for storage (per scripts/test-seo-schema.ts pattern).
 *
 * Run: pnpm tsx scripts/test-seo-serp-fetcher-cache.ts
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sql, eq } from "drizzle-orm";

// Stub `server-only` (idempotent) — same trick as test-seo-locale-heuristics.
const serverOnlyDir = resolve(__dirname, "..", "node_modules", "server-only");
if (!existsSync(serverOnlyDir)) {
  mkdirSync(serverOnlyDir, { recursive: true });
  writeFileSync(
    join(serverOnlyDir, "package.json"),
    JSON.stringify({ name: "server-only", main: "index.js" }),
  );
  writeFileSync(
    join(serverOnlyDir, "index.js"),
    "// Stub for tests.\n",
  );
}

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), "opencopy-seo-serp-"));
  process.env.OPENCOPY_EMBEDDED_DB = "1";
  process.env.OPENCOPY_DATA_DIR = dataDir;
  process.env.NODE_ENV = "production";
  process.env.SEO_SERP_TEST_MODE = "1";

  console.log("→ migrate PGlite");
  // Use a fresh PGlite client to run migrations + seed. After this we
  // close it and let `@/db/client` open its own instance against the
  // same dataDir — there's only ever one PGlite instance pointed at a
  // dataDir at a time, so we must release this one before importing
  // `@/db/client`.
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite/vector");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("../src/db/schema");

  const setupClient = new PGlite(dataDir, { extensions: { vector } });
  await setupClient.waitReady;
  const setupDb = drizzle(setupClient, { schema });
  await setupDb.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await migrate(setupDb, { migrationsFolder: "./drizzle" });

  const [user] = await setupDb
    .insert(schema.users)
    .values({ name: "Diana", email: "diana@example.com" })
    .returning();
  const [workspace] = await setupDb
    .insert(schema.workspaces)
    .values({
      name: "Diana's brand",
      slug: "dianas-brand-serp",
      defaultLocale: "pl",
      createdByUserId: user.id,
    })
    .returning();
  console.log("✓ seeded workspace");

  // Hand off the dataDir. Close the setup client so `@/db/client` can
  // open its own (PGlite locks the data dir to a single process-local
  // instance).
  await setupClient.close();

  // Inject a custom fixture set onto globalThis. The serp-fetcher's
  // test-mode short-circuit consults `__seoSerpTestFixtures` keyed by
  // `${workspaceId}::${keyword}::${locale}`. Setting "default" handles
  // any other call.
  (globalThis as Record<string, unknown>).__seoSerpTestFixtures = {
    default: [
      {
        rank: 1,
        url: "https://example.pl/wygodne",
        title: "Wygodne buty damskie — przewodnik",
        h1: "Wygodne buty damskie",
        h2: ["Wprowadzenie", "Cena", "Recenzje"],
        fullText: "Tekst przykładowy.",
      },
      {
        rank: 2,
        url: "https://example.pl/buty",
        title: "Buty na lato",
        h1: "Buty letnie",
        h2: ["Czym są", "Cena"],
        fullText: "Tekst 2.",
      },
    ],
  };

  // Patch global fetch and bookkeep the call count. The test asserts
  // that fetchSerp DOES NOT call fetch in test mode, AND DOES NOT call
  // fetch on cache-hit branches.
  let fetchCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (...args: unknown[]) => {
    fetchCalls++;
    throw new Error("fetch should not be called in this test");
  }) as typeof fetch;

  const { fetchSerp } = await import("../src/lib/seo/serp-fetcher");
  // Pull the same `db` the fetcher uses — assertions need to read through
  // the *fetcher's* connection or PGlite's per-instance state will hide
  // newly-written rows from the test.
  const { db } = await import("../src/db/client");

  // ------------------------------------------------------------------
  // 1. Cache miss — populates cache (via test-mode path).
  // ------------------------------------------------------------------
  console.log("\n→ first call: cache miss, test-mode populates");
  const r1 = await fetchSerp({
    workspaceId: workspace.id,
    keyword: "wygodne buty damskie",
    locale: "pl",
  });
  if (r1.length !== 2) fail(`first call: expected 2 results, got ${r1.length}`);
  if (r1[0].h2[0] !== "Wprowadzenie")
    fail("first call: h2 missing from fixture");

  const cached = await db
    .select()
    .from(schema.seoSerpCache)
    .where(eq(schema.seoSerpCache.workspaceId, workspace.id));
  if (cached.length !== 1)
    fail(`expected 1 cache row, found ${cached.length}`);
  if (cached[0].results.length !== 2)
    fail("cache row results count wrong");
  console.log("✓ cache populated from test fixture");

  // ------------------------------------------------------------------
  // 2. Cache hit — returns cached, no fetch.
  // ------------------------------------------------------------------
  console.log("\n→ second call: cache hit, returns cached without fetch");
  const r2 = await fetchSerp({
    workspaceId: workspace.id,
    keyword: "wygodne buty damskie",
    locale: "pl",
  });
  if (r2.length !== 2) fail(`second call: expected 2 results, got ${r2.length}`);
  if (fetchCalls !== 0)
    fail(`fetch was called ${fetchCalls} times; expected 0`);
  console.log("✓ cache hit, no fetch issued");

  // ------------------------------------------------------------------
  // 3. Expire the cache row → refetch.
  // ------------------------------------------------------------------
  console.log("\n→ expire cache row, third call refetches");
  await db
    .update(schema.seoSerpCache)
    .set({
      expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute ago
      results: [],
    })
    .where(eq(schema.seoSerpCache.workspaceId, workspace.id));

  const r3 = await fetchSerp({
    workspaceId: workspace.id,
    keyword: "wygodne buty damskie",
    locale: "pl",
  });
  if (r3.length !== 2) fail(`third call: expected 2 results after expiry, got ${r3.length}`);
  if (fetchCalls !== 0)
    fail(`fetch should still be 0 (test mode used); got ${fetchCalls}`);

  const refreshed = await db
    .select()
    .from(schema.seoSerpCache)
    .where(eq(schema.seoSerpCache.workspaceId, workspace.id));
  if (refreshed.length !== 1)
    fail(`refresh: expected 1 cache row, got ${refreshed.length}`);
  if (refreshed[0].expiresAt < new Date()) {
    fail("expiresAt should be back in the future after refetch");
  }
  if (refreshed[0].results.length !== 2)
    fail("refreshed cache row should carry fixture data again");
  console.log("✓ expired row triggered upsert with fresh fixture data");

  // ------------------------------------------------------------------
  // 4. Different locale on same keyword → separate cache row.
  // ------------------------------------------------------------------
  console.log("\n→ different locale uses a separate cache row");
  await fetchSerp({
    workspaceId: workspace.id,
    keyword: "wygodne buty damskie",
    locale: "en",
  });
  const allCached = await db
    .select()
    .from(schema.seoSerpCache)
    .where(eq(schema.seoSerpCache.workspaceId, workspace.id));
  if (allCached.length !== 2)
    fail(`expected 2 cache rows (pl + en), got ${allCached.length}`);
  console.log("✓ per-locale cache row created");

  // Restore.
  globalThis.fetch = realFetch;
  // The fetcher's PGlite (cached on globalThis) is the live one; close it
  // before nuking the dataDir to avoid an EBUSY on Windows.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cachedPool = (globalThis as any).__opencopyDb?.pool as { close?: () => Promise<void> } | undefined;
  if (cachedPool?.close) await cachedPool.close();
  rmSync(dataDir, { recursive: true, force: true });

  console.log("\n✓ serp fetcher cache smoke clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
