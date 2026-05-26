/**
 * Smoke test the brand_profile_crawl cache helpers.
 *
 *   - First write inserts a `ready` row with TTL = now+24h.
 *   - readCrawlCache returns the payload for non-expired ready rows.
 *   - Expired rows (expiresAt < now) return null.
 *   - Failed rows (status='failed') return null even when not expired.
 *   - Different jsRendered flag yields a separate cache row.
 *
 * Uses PGlite via `@/db/client` (per scripts/test-seo-locale-heuristics.ts
 * pattern) — set the embedded env vars BEFORE importing client.ts.
 *
 * Run: pnpm tsx scripts/test-brand-profile-cache.ts
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sql, and, eq } from "drizzle-orm";

const serverOnlyDir = resolve(__dirname, "..", "node_modules", "server-only");
if (!existsSync(serverOnlyDir)) {
  mkdirSync(serverOnlyDir, { recursive: true });
  writeFileSync(
    join(serverOnlyDir, "package.json"),
    JSON.stringify({ name: "server-only", main: "index.js" }),
  );
  writeFileSync(join(serverOnlyDir, "index.js"), "// stub\n");
}

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), "opencopy-bp-cache-"));
  process.env.OPENCOPY_EMBEDDED_DB = "1";
  process.env.OPENCOPY_DATA_DIR = dataDir;
  process.env.NODE_ENV = "production";

  console.log("→ migrate PGlite via @/db/client");
  const clientMod = await import("../src/db/client");
  const schema = await import("../src/db/schema");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = clientMod.db as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pool = clientMod.pool as any;

  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db, { migrationsFolder: "./drizzle" });

  const [user] = await db
    .insert(schema.users)
    .values({ name: "Diana", email: "diana@example.com" })
    .returning();
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      name: "Diana's brand",
      slug: "dianas-brand-bp-cache",
      defaultLocale: "pl",
      createdByUserId: user.id,
    })
    .returning();
  console.log("✓ seeded workspace");

  const {
    readCrawlCache,
    writeCrawlCache,
    CRAWL_CACHE_TTL_MS,
  } = await import("../src/lib/brand-profile/cache");

  const url = "https://acme.com/";
  const samplePayload = {
    pages: [
      {
        url: "https://acme.com/",
        locale: "pl" as const,
        title: "Strona główna",
        text: "Treść strony głównej.",
        headings: { h1: ["Witaj"], h2: ["O nas"], h3: [] },
      },
    ],
    detectedLocales: ["pl" as const],
    sitemapFound: true,
    robotsBlocked: false,
  };

  // ------------------------------------------------------------------
  // 1. Miss before any write.
  // ------------------------------------------------------------------
  console.log("\n→ initial read → miss");
  const miss = await readCrawlCache({
    workspaceId: workspace.id,
    url,
    jsRendered: false,
  });
  if (miss !== null) fail("expected miss on empty cache");
  console.log("✓ cache miss");

  // ------------------------------------------------------------------
  // 2. Write ready → read hits.
  // ------------------------------------------------------------------
  console.log("\n→ write ready, read hits");
  await writeCrawlCache({
    workspaceId: workspace.id,
    url,
    jsRendered: false,
    createdByUserId: user.id,
    finalUrl: "https://acme.com/",
    status: "ready",
    payload: samplePayload,
  });

  const hit = await readCrawlCache({
    workspaceId: workspace.id,
    url,
    jsRendered: false,
  });
  if (!hit) fail("write+read should return payload");
  if (hit.pages.length !== 1) fail("payload pages count wrong");
  if (hit.pages[0].title !== "Strona główna")
    fail("payload title round-trip failed");
  if (!hit.sitemapFound) fail("sitemapFound flag lost");
  console.log("✓ ready row round-trips");

  // ------------------------------------------------------------------
  // 3. expiresAt was set to ~now + 24h.
  // ------------------------------------------------------------------
  console.log("\n→ expiresAt set to now+24h");
  const rows = await db
    .select()
    .from(schema.brandProfileCrawls)
    .where(eq(schema.brandProfileCrawls.workspaceId, workspace.id));
  if (rows.length !== 1) fail(`expected 1 row, got ${rows.length}`);
  const expiry = rows[0].expiresAt as Date;
  const expected = Date.now() + CRAWL_CACHE_TTL_MS;
  const drift = Math.abs(expiry.getTime() - expected);
  if (drift > 60_000)
    fail(`expiresAt off by ${drift}ms from expected 24h`);
  console.log(`✓ expiresAt set to +24h (drift ${drift}ms)`);

  // ------------------------------------------------------------------
  // 4. Expire the row → read misses.
  // ------------------------------------------------------------------
  console.log("\n→ expire row → read misses");
  await db
    .update(schema.brandProfileCrawls)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(schema.brandProfileCrawls.workspaceId, workspace.id));
  const expired = await readCrawlCache({
    workspaceId: workspace.id,
    url,
    jsRendered: false,
  });
  if (expired !== null) fail("expired row should return null");
  console.log("✓ expired row → miss");

  // ------------------------------------------------------------------
  // 5. Re-write replaces (upsert), restoring TTL.
  // ------------------------------------------------------------------
  console.log("\n→ re-write upserts");
  await writeCrawlCache({
    workspaceId: workspace.id,
    url,
    jsRendered: false,
    createdByUserId: user.id,
    finalUrl: "https://acme.com/",
    status: "ready",
    payload: samplePayload,
  });
  const refreshed = await db
    .select()
    .from(schema.brandProfileCrawls)
    .where(eq(schema.brandProfileCrawls.workspaceId, workspace.id));
  if (refreshed.length !== 1)
    fail(`upsert should keep 1 row, got ${refreshed.length}`);
  const refreshedExpiry = refreshed[0].expiresAt as Date;
  if (refreshedExpiry.getTime() < Date.now())
    fail("upserted row should have fresh expiry in the future");
  console.log("✓ row upserted, expiresAt back to +24h");

  // ------------------------------------------------------------------
  // 6. Failed status returns null from read.
  // ------------------------------------------------------------------
  console.log("\n→ failed row → read returns null");
  await writeCrawlCache({
    workspaceId: workspace.id,
    url: "https://other.example/",
    jsRendered: false,
    createdByUserId: user.id,
    finalUrl: "https://other.example/",
    status: "failed",
    payload: { pages: [], detectedLocales: ["en"], sitemapFound: false, robotsBlocked: false },
    error: "boom",
  });
  const failHit = await readCrawlCache({
    workspaceId: workspace.id,
    url: "https://other.example/",
    jsRendered: false,
  });
  if (failHit !== null) fail("failed row should not be served via read");
  // But the row exists in DB:
  const failRows = await db
    .select()
    .from(schema.brandProfileCrawls)
    .where(
      and(
        eq(schema.brandProfileCrawls.workspaceId, workspace.id),
        eq(schema.brandProfileCrawls.url, "https://other.example/"),
      ),
    );
  if (failRows.length !== 1) fail("failed row should still be persisted");
  if (failRows[0].error !== "boom") fail("error text lost");
  console.log("✓ failed row persisted but read-skipped");

  // ------------------------------------------------------------------
  // 7. jsRendered=true is a separate cache key.
  // ------------------------------------------------------------------
  console.log("\n→ jsRendered split: static vs JS rows coexist");
  await writeCrawlCache({
    workspaceId: workspace.id,
    url,
    jsRendered: true,
    createdByUserId: user.id,
    finalUrl: "https://acme.com/",
    status: "ready",
    payload: {
      ...samplePayload,
      pages: [{ ...samplePayload.pages[0], title: "JS-rendered" }],
    },
  });
  const staticHit = await readCrawlCache({
    workspaceId: workspace.id,
    url,
    jsRendered: false,
  });
  const jsHit = await readCrawlCache({
    workspaceId: workspace.id,
    url,
    jsRendered: true,
  });
  if (!staticHit || staticHit.pages[0].title !== "Strona główna")
    fail("static row lost");
  if (!jsHit || jsHit.pages[0].title !== "JS-rendered")
    fail("JS row lost");
  const all = await db
    .select()
    .from(schema.brandProfileCrawls)
    .where(
      and(
        eq(schema.brandProfileCrawls.workspaceId, workspace.id),
        eq(schema.brandProfileCrawls.url, url),
      ),
    );
  if (all.length !== 2)
    fail(`expected 2 rows for url across jsRendered, got ${all.length}`);
  console.log("✓ jsRendered separates rows");

  await pool.close?.();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__opencopyDb = undefined;
  rmSync(dataDir, { recursive: true, force: true });

  console.log("\n✓ brand-profile cache smoke clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
