// Smoke test for the SEO audit schema (Phase 0 of the v2.5.x SEO post-hoc
// audit feature). Sets up an in-process PGlite, runs the full migration
// stack, inserts a workspace + user + document + voice, then exercises the
// three new tables: seo_audit_report (full snapshot), seo_serp_cache
// (24h cache with unique key on workspace+keyword+locale), and
// seo_locale_heuristics_override (composite PK on workspace+locale).
//
//   pnpm tsx scripts/test-seo-schema.ts

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql, and, eq } from "drizzle-orm";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), "opencopy-seo-schema-"));
  process.env.OPENCOPY_EMBEDDED_DB = "1";
  process.env.OPENCOPY_DATA_DIR = dataDir;
  process.env.NODE_ENV = "production";

  console.log("→ migrate PGlite");
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite/vector");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("../src/db/schema");

  const client = new PGlite(dataDir, { extensions: { vector } });
  await client.waitReady;
  const db = drizzle(client, { schema });
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ migrations applied");

  console.log("\n→ seed user + workspace + document + voice");
  const [user] = await db
    .insert(schema.users)
    .values({ name: "Diana", email: "diana@example.com" })
    .returning();
  if (!user) fail("user insert returned no row");

  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      name: "Diana's brand",
      slug: "dianas-brand",
      defaultLocale: "pl",
      createdByUserId: user.id,
    })
    .returning();
  if (!workspace) fail("workspace insert returned no row");

  const [voice] = await db
    .insert(schema.brandVoices)
    .values({
      workspaceId: workspace.id,
      name: "House voice",
      defaultLocale: "pl",
      createdByUserId: user.id,
    })
    .returning();
  if (!voice) fail("voice insert returned no row");

  const [doc] = await db
    .insert(schema.documents)
    .values({
      workspaceId: workspace.id,
      title: "Czemu warto kupić nasze buty",
      contentHtml: "<p>Buty są wygodne i tanie.</p>",
      contentText: "Buty są wygodne i tanie.",
      voiceId: voice.id,
      locale: "pl",
      createdByUserId: user.id,
    })
    .returning();
  if (!doc) fail("document insert returned no row");
  console.log(`✓ seed complete (doc=${doc.id})`);

  console.log("\n→ insert seo_audit_report with full criterion shape");
  const criterionScores: schema.SeoCriterionScores = {
    density: { score: 78, details: { count: 6, ratio: 0.012, target: 0.015 } },
    semantic: { score: 82, details: { cosine: 0.62, model: "bge-m3" } },
    intent: {
      score: 90,
      details: { detected: "commercial", expected: "commercial" },
    },
    structure: { score: 65, details: { h1: 0, h2: 0, h3: 0 } },
    length: { score: 30, details: { words: 6, target: 1000 } },
    readability: { score: 70, details: { fleschPl: 55 } },
    contentGap: { score: 50, details: { topicsCovered: 1, topicsTotal: 4 } },
  };

  const suggestions: schema.SeoSuggestion[] = [
    {
      id: crypto.randomUUID(),
      type: "rewrite_paragraph",
      status: "pending",
      excerpt: "Buty są wygodne i tanie.",
      description:
        "Zbyt ogólne — dodaj target keyword 'wygodne buty damskie' i benefit.",
    },
    {
      id: crypto.randomUUID(),
      type: "add_heading",
      status: "pending",
      description: "Brak nagłówka H1 — dodaj jeden z target keywordem.",
    },
  ];

  const [audit] = await db
    .insert(schema.seoAuditReports)
    .values({
      workspaceId: workspace.id,
      documentId: doc.id,
      voiceId: voice.id,
      locale: "pl",
      primaryKeyword: "wygodne buty damskie",
      primaryKeywordInferred: false,
      secondaryKeywords: ["buty na lato", "buty w dobrej cenie"],
      detectedIntent: "commercial",
      compositeScore: 66,
      criterionScores,
      suggestions,
      docTextSnapshot: doc.contentText,
      auditorModelId: "anthropic/claude-sonnet-4.6",
      copywriterModelId: "anthropic/claude-sonnet-4.6",
      durationMs: 8420,
      createdByUserId: user.id,
    })
    .returning();
  if (!audit) fail("audit insert returned no row");
  console.log(`✓ inserted audit (score=${audit.compositeScore})`);

  console.log("\n→ round-trip jsonb shapes survive");
  const [readBack] = await db
    .select()
    .from(schema.seoAuditReports)
    .where(eq(schema.seoAuditReports.id, audit.id));
  if (!readBack) fail("read-back: no row");
  if (readBack.criterionScores.density.score !== 78) {
    fail(
      `criterionScores.density.score lost — got ${readBack.criterionScores.density.score}`,
    );
  }
  if (
    (readBack.criterionScores.density.details as { count: number }).count !== 6
  ) {
    fail("criterionScores nested details lost");
  }
  if (readBack.suggestions.length !== 2) {
    fail(`suggestions count: expected 2, got ${readBack.suggestions.length}`);
  }
  if (readBack.suggestions[0].type !== "rewrite_paragraph") {
    fail(`suggestion type lost: ${readBack.suggestions[0].type}`);
  }
  if (
    JSON.stringify(readBack.secondaryKeywords) !==
    JSON.stringify(["buty na lato", "buty w dobrej cenie"])
  ) {
    fail("secondaryKeywords array lost");
  }
  console.log("✓ jsonb round-trip clean");

  console.log("\n→ insert seo_serp_cache and verify (workspace, keyword, locale) uniqueness");
  await db.insert(schema.seoSerpCache).values({
    workspaceId: workspace.id,
    keyword: "wygodne buty damskie",
    locale: "pl",
    results: [
      {
        rank: 1,
        url: "https://example.pl/wygodne-buty",
        title: "Wygodne buty damskie — przewodnik",
        h1: "Wygodne buty damskie",
        h2: ["Dlaczego wygoda", "Materiały"],
        fullText: "Treść przykładowa…",
      },
    ],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  let dupCaught = false;
  try {
    await db.insert(schema.seoSerpCache).values({
      workspaceId: workspace.id,
      keyword: "wygodne buty damskie",
      locale: "pl",
      results: [],
      expiresAt: new Date(),
    });
  } catch {
    dupCaught = true;
  }
  if (!dupCaught) {
    fail(
      "second insert with same (workspace, keyword, locale) should have failed unique constraint",
    );
  }
  console.log("✓ unique constraint enforced");

  console.log("\n→ same keyword on different locale is allowed");
  await db.insert(schema.seoSerpCache).values({
    workspaceId: workspace.id,
    keyword: "wygodne buty damskie",
    locale: "en",
    results: [],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  console.log("✓ cross-locale insert succeeded");

  console.log("\n→ insert seo_locale_heuristics_override + composite PK");
  await db.insert(schema.seoLocaleHeuristicsOverride).values({
    workspaceId: workspace.id,
    locale: "pl",
    heuristics: {
      avgQueryTokens: 4,
      commercialIntentTriggers: ["kupić", "cena", "tanie"],
      informationalIntentTriggers: ["jak", "co to", "dlaczego"],
      notes: "Polish queries are ~30% longer than English averages.",
    },
  });

  let pkCaught = false;
  try {
    await db.insert(schema.seoLocaleHeuristicsOverride).values({
      workspaceId: workspace.id,
      locale: "pl",
      heuristics: { notes: "duplicate" },
    });
  } catch {
    pkCaught = true;
  }
  if (!pkCaught) {
    fail("duplicate (workspace, locale) primary key should have failed");
  }
  console.log("✓ composite PK enforced");

  console.log("\n→ FK cascade: deleting document removes audit reports");
  await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  const remaining = await db
    .select()
    .from(schema.seoAuditReports)
    .where(eq(schema.seoAuditReports.documentId, doc.id));
  if (remaining.length !== 0) {
    fail(`expected cascade to remove audits, found ${remaining.length}`);
  }
  console.log("✓ cascade clean");

  console.log("\n→ FK cascade: deleting workspace removes SERP cache + heuristics");
  await db
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, workspace.id));
  const serpRemaining = await db
    .select()
    .from(schema.seoSerpCache)
    .where(eq(schema.seoSerpCache.workspaceId, workspace.id));
  if (serpRemaining.length !== 0) {
    fail(`serp cache cascade failed, ${serpRemaining.length} rows remain`);
  }
  const heuRemaining = await db
    .select()
    .from(schema.seoLocaleHeuristicsOverride)
    .where(
      and(
        eq(schema.seoLocaleHeuristicsOverride.workspaceId, workspace.id),
        eq(schema.seoLocaleHeuristicsOverride.locale, "pl"),
      ),
    );
  if (heuRemaining.length !== 0) {
    fail("locale heuristics cascade failed");
  }
  console.log("✓ workspace cascade clean");

  await client.close();
  rmSync(dataDir, { recursive: true, force: true });

  console.log("\n✓ SEO schema smoke clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
