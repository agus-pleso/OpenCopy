/**
 * Smoke test the locale heuristics resolver.
 *
 *  - Defaults exist for all four locales.
 *  - DB override row beats constants (workspace-scoped).
 *  - Cascade behaviour: deleting a workspace removes its overrides.
 *
 * Uses PGlite via `@/db/client` so the global-cache invariant in
 * `src/db/client.ts` holds — creating a second standalone PGlite on the same
 * dataDir hangs on the file lock (see project_build_gotchas memory + commit
 * f979b6f). The test sets the env vars *before* importing client.ts so the
 * embedded path is taken, then drives migrations through that same client.
 *
 * Run: pnpm tsx scripts/test-seo-locale-heuristics.ts
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sql, eq, and } from "drizzle-orm";

// Stub `server-only` for the test runner. Next.js' published `server-only`
// throws at import-time to keep server modules out of client bundles; in
// a tsx script we want them to load. Create a tiny shim package in
// node_modules if it doesn't already exist. Idempotent.
const serverOnlyDir = resolve(__dirname, "..", "node_modules", "server-only");
if (!existsSync(serverOnlyDir)) {
  mkdirSync(serverOnlyDir, { recursive: true });
  writeFileSync(
    join(serverOnlyDir, "package.json"),
    JSON.stringify({ name: "server-only", main: "index.js" }),
  );
  writeFileSync(
    join(serverOnlyDir, "index.js"),
    "// Stub for tests — the real `server-only` throws to guard the client bundle.\n",
  );
}

import {
  defaultLocaleHeuristics,
  LOCALE_HEURISTICS_DEFAULTS,
  mergeLocaleHeuristics,
} from "../src/lib/seo/locale-heuristics-shared";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

async function main() {
  // ------------------------------------------------------------------
  // 1. Constants present for all four locales.
  // ------------------------------------------------------------------
  for (const locale of ["en", "pl", "ro", "uk"] as const) {
    const h = defaultLocaleHeuristics(locale);
    if (!h) fail(`no default for ${locale}`);
    if (typeof h.avgQueryTokens !== "number")
      fail(`${locale}: avgQueryTokens missing`);
    if (!Array.isArray(h.commercialIntentTriggers))
      fail(`${locale}: commercialIntentTriggers missing`);
    if (!Array.isArray(h.informationalIntentTriggers))
      fail(`${locale}: informationalIntentTriggers missing`);
    if (!h.targetKeywordDensityRange)
      fail(`${locale}: targetKeywordDensityRange missing`);
    if (!h.targetWordCounts) fail(`${locale}: targetWordCounts missing`);
    if (!h.searchDomain) fail(`${locale}: searchDomain missing`);
  }
  console.log("✓ defaults exist for all 4 locales");

  // ------------------------------------------------------------------
  // 2. CEE locales differ from en.
  // ------------------------------------------------------------------
  if (LOCALE_HEURISTICS_DEFAULTS.pl.searchDomain === "google.com") {
    fail("pl should use google.pl");
  }
  if (LOCALE_HEURISTICS_DEFAULTS.ro.searchDomain !== "google.ro") {
    fail("ro should use google.ro");
  }
  if (LOCALE_HEURISTICS_DEFAULTS.uk.searchDomain !== "google.com.ua") {
    fail("uk should use google.com.ua (not google.ua)");
  }
  console.log("✓ CEE locale search domains differ from en");

  // ------------------------------------------------------------------
  // 3. mergeLocaleHeuristics overlays without dropping defaults.
  // ------------------------------------------------------------------
  const base = defaultLocaleHeuristics("pl");
  const merged = mergeLocaleHeuristics(base, {
    avgQueryTokens: 7,
    commercialIntentTriggers: ["bestselling"],
    notes: "Custom workspace notes.",
  });
  if (merged.avgQueryTokens !== 7) fail("avgQueryTokens didn't override");
  if (
    !Array.isArray(merged.commercialIntentTriggers) ||
    merged.commercialIntentTriggers[0] !== "bestselling"
  ) {
    fail("commercialIntentTriggers didn't override");
  }
  if (
    !merged.informationalIntentTriggers ||
    !merged.informationalIntentTriggers.includes("jak")
  ) {
    fail("informationalIntentTriggers should have inherited");
  }
  if (merged.targetKeywordDensityRange.min !==
      base.targetKeywordDensityRange.min) {
    fail("targetKeywordDensityRange should have inherited");
  }
  console.log("✓ mergeLocaleHeuristics preserves non-overridden fields");

  // ------------------------------------------------------------------
  // 4. PGlite round-trip via @/db/client. Set the embedded env vars
  //    BEFORE importing the client so it takes the PGlite path. The
  //    global cache in client.ts then keeps every downstream
  //    `getLocaleHeuristics` call on the same instance — no dual-PGlite
  //    deadlock on the dataDir's file lock.
  // ------------------------------------------------------------------
  const dataDir = mkdtempSync(join(tmpdir(), "opencopy-seo-locale-"));
  process.env.OPENCOPY_EMBEDDED_DB = "1";
  process.env.OPENCOPY_DATA_DIR = dataDir;
  process.env.NODE_ENV = "production";

  console.log("\n→ migrate PGlite via @/db/client");
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
      slug: "dianas-brand-heuristics",
      defaultLocale: "pl",
      createdByUserId: user.id,
    })
    .returning();
  console.log("✓ seeded workspace");

  // Insert an override.
  await db.insert(schema.seoLocaleHeuristicsOverride).values({
    workspaceId: workspace.id,
    locale: "pl",
    heuristics: {
      avgQueryTokens: 9,
      commercialIntentTriggers: ["custom-trigger"],
      informationalIntentTriggers: ["custom-info"],
      notes: "Workspace-specific.",
    },
  });

  // `getLocaleHeuristics` reads `db` from `@/db/client` — same cached
  // PGlite instance, so the row above is visible without a second client.
  const { getLocaleHeuristics } = await import(
    "../src/lib/seo/locale-heuristics"
  );

  const resolved = await getLocaleHeuristics(workspace.id, "pl");
  if (resolved.avgQueryTokens !== 9) {
    fail(
      `override avgQueryTokens not applied: got ${resolved.avgQueryTokens}`,
    );
  }
  if (resolved.commercialIntentTriggers?.[0] !== "custom-trigger") {
    fail("override commercialIntentTriggers not applied");
  }
  // searchDomain isn't override-able in the schema interface today —
  // make sure the resolver carries the default constant through.
  if (resolved.searchDomain !== "google.pl") {
    fail(`searchDomain should still be google.pl, got ${resolved.searchDomain}`);
  }
  console.log("✓ override beats constants");

  // Locale without an override row gets the default.
  const enResolved = await getLocaleHeuristics(workspace.id, "en");
  if (enResolved.avgQueryTokens !== 3) {
    fail(
      `en without override should default to 3, got ${enResolved.avgQueryTokens}`,
    );
  }
  console.log("✓ unset locale uses defaults");

  // Cascade on workspace delete.
  await db
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, workspace.id));
  const remaining = await db
    .select()
    .from(schema.seoLocaleHeuristicsOverride)
    .where(
      and(
        eq(schema.seoLocaleHeuristicsOverride.workspaceId, workspace.id),
        eq(schema.seoLocaleHeuristicsOverride.locale, "pl"),
      ),
    );
  if (remaining.length !== 0) {
    fail("override row should cascade-delete with workspace");
  }
  console.log("✓ workspace delete cascades");

  await pool.close?.();
  // Drop the global cache so a second `import("@/db/client")` in the same
  // process would re-init against a different dataDir, if anyone needs it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__opencopyDb = undefined;
  rmSync(dataDir, { recursive: true, force: true });

  console.log("\n✓ locale heuristics smoke clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
