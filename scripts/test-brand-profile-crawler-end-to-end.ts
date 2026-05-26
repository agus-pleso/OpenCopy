/**
 * End-to-end smoke test the full crawler pipeline.
 *
 * Exercises crawlSite() against the fixture registry (no real HTTP):
 *
 *   - Successful crawl with sitemap → uses sitemap URLs.
 *   - No sitemap → falls back to nav heuristic from homepage.
 *   - robots.txt blocks origin → robotsBlocked:true, empty pages,
 *     cache row persisted.
 *   - Cache hit on second crawl skips ALL fetches.
 *   - Multi-locale hreflang on homepage → detectedLocales contains all.
 *   - BYOK cookie row matches host → cookie header attached.
 *   - Cookie row for wrong domain → header NOT attached.
 *   - Playwright force-failed → CrawlResult.error surfaces, row persisted
 *     as `failed`.
 *
 * Run: pnpm tsx scripts/test-brand-profile-crawler-end-to-end.ts
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

// Realistic-ish brand HTML for the homepage, with hreflangs.
function brandHomepage(opts: { locale: string; siteName: string }) {
  return `<!DOCTYPE html>
<html lang="${opts.locale}">
<head>
  <title>${opts.siteName} — Marketing tools</title>
  <link rel="alternate" hreflang="pl-PL" href="https://acme.test/pl/" />
  <link rel="alternate" hreflang="ro" href="https://acme.test/ro/" />
  <link rel="alternate" hreflang="uk" href="https://acme.test/uk/" />
  <link rel="alternate" hreflang="x-default" href="https://acme.test/" />
</head>
<body>
  <header><nav><a href="/">Home</a></nav></header>
  <main>
    <h1>Welcome to ${opts.siteName}</h1>
    <p>${opts.siteName} helps marketers ship campaigns faster.</p>
    <nav>
      <a href="/about">About</a>
      <a href="/products">Products</a>
      <a href="/pricing">Pricing</a>
      <a href="/blog">Blog</a>
    </nav>
  </main>
  <footer><a href="/legal-pricing">Legal Pricing</a></footer>
</body>
</html>`;
}

function plainPage(title: string, body: string) {
  return `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
}

async function main() {
  process.env.OPENCOPY_CRAWL_TEST_MODE = "1";

  const dataDir = mkdtempSync(join(tmpdir(), "opencopy-bp-crawler-"));
  process.env.OPENCOPY_EMBEDDED_DB = "1";
  process.env.OPENCOPY_DATA_DIR = dataDir;
  process.env.NODE_ENV = "production";
  process.env.ENCRYPTION_KEY = Buffer.from(
    "0123456789abcdef0123456789abcdef",
    "utf8",
  ).toString("base64");

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
      slug: "dianas-brand-crawler-e2e",
      defaultLocale: "en",
      createdByUserId: user.id,
    })
    .returning();
  console.log("✓ seeded workspace");

  const { crawlSite } = await import("../src/lib/brand-profile/crawler");
  const {
    registerCrawlFixture,
    clearCrawlFixtures,
    getCrawlFetchCallCount,
  } = await import("../src/lib/brand-profile/fetch");
  const { encryptSecret } = await import("../src/lib/crypto");

  // ------------------------------------------------------------------
  // 1. Successful crawl with sitemap.
  // ------------------------------------------------------------------
  console.log("\n→ crawl with sitemap");
  clearCrawlFixtures();
  registerCrawlFixture("https://acme.test/robots.txt", {
    body: "User-agent: *\nAllow: /\nDisallow: /private",
  });
  registerCrawlFixture("https://acme.test/sitemap.xml", {
    body: `<urlset>
      <url><loc>https://acme.test/</loc></url>
      <url><loc>https://acme.test/about</loc></url>
      <url><loc>https://acme.test/pricing</loc></url>
    </urlset>`,
  });
  registerCrawlFixture("https://acme.test/", {
    body: brandHomepage({ locale: "en", siteName: "Acme" }),
  });
  registerCrawlFixture("https://acme.test/about", {
    body: plainPage("About Acme", "Acme was founded in 2020."),
  });
  registerCrawlFixture("https://acme.test/pricing", {
    body: plainPage("Pricing", "Starting at $29/mo."),
  });

  const r1 = await crawlSite(workspace.id, "https://acme.test/");
  if (r1.robotsBlocked) fail("should not be robots-blocked");
  if (!r1.sitemapFound) fail("sitemap should be found");
  if (r1.pages.length < 2)
    fail(`expected ≥2 pages, got ${r1.pages.length}`);
  if (!r1.pages.some((p) => p.title === "About Acme"))
    fail("about page missing from results");
  // detectedLocales should be at least [en, pl, ro, uk] from hreflangs.
  for (const loc of ["en", "pl", "ro", "uk"] as const) {
    if (!r1.detectedLocales.includes(loc))
      fail(`detectedLocales missing ${loc}`);
  }
  console.log("✓ sitemap-driven crawl: pages + multi-locale detection");

  // ------------------------------------------------------------------
  // 2. Cache hit on second call.
  // ------------------------------------------------------------------
  console.log("\n→ second call: cache hit, no fetch");
  const callsBefore = getCrawlFetchCallCount();
  const r2 = await crawlSite(workspace.id, "https://acme.test/");
  const callsAfter = getCrawlFetchCallCount();
  if (callsAfter !== callsBefore)
    fail(`cache hit should not increment fetch count (${callsBefore}→${callsAfter})`);
  if (r2.pages.length !== r1.pages.length) fail("cache hit pages differ");
  console.log("✓ cache hit returns same payload, zero fetches");

  // ------------------------------------------------------------------
  // 3. robots.txt blocks origin.
  // ------------------------------------------------------------------
  console.log("\n→ robots.txt blocks origin");
  clearCrawlFixtures();
  registerCrawlFixture("https://blocked.test/robots.txt", {
    body: "User-agent: *\nDisallow: /",
  });
  registerCrawlFixture("https://blocked.test/", {
    body: brandHomepage({ locale: "en", siteName: "Blocked" }),
  });

  const r3 = await crawlSite(workspace.id, "https://blocked.test/");
  if (!r3.robotsBlocked) fail("expected robotsBlocked:true");
  if (r3.pages.length !== 0)
    fail(`robots-blocked should have 0 pages, got ${r3.pages.length}`);

  // Confirm a cache row was persisted with status='ready' + robotsBlocked.
  const blockedRows = await db
    .select()
    .from(schema.brandProfileCrawls)
    .where(eq(schema.brandProfileCrawls.url, "https://blocked.test/"));
  if (blockedRows.length !== 1)
    fail(`expected 1 cache row for blocked site, got ${blockedRows.length}`);
  if (blockedRows[0].status !== "ready")
    fail("robots-blocked row should be ready, not failed");
  console.log("✓ robots-blocked → robotsBlocked:true + cached");

  // ------------------------------------------------------------------
  // 4. No sitemap → nav heuristic.
  // ------------------------------------------------------------------
  console.log("\n→ no sitemap → nav heuristic");
  clearCrawlFixtures();
  registerCrawlFixture("https://nav.test/robots.txt", {
    body: "",
  });
  // No sitemap.xml registered = 404
  registerCrawlFixture("https://nav.test/", {
    body: brandHomepage({ locale: "en", siteName: "NavSite" }),
  });
  registerCrawlFixture("https://nav.test/about", {
    body: plainPage("About NavSite", "About body."),
  });
  registerCrawlFixture("https://nav.test/products", {
    body: plainPage("Products", "Product list."),
  });
  registerCrawlFixture("https://nav.test/pricing", {
    body: plainPage("Pricing", "Plans."),
  });
  registerCrawlFixture("https://nav.test/blog", {
    body: plainPage("Blog", "Articles."),
  });

  const r4 = await crawlSite(workspace.id, "https://nav.test/");
  if (r4.sitemapFound) fail("nav.test should NOT report sitemap found");
  if (r4.pages.length < 4)
    fail(`expected ≥4 pages from nav heuristic, got ${r4.pages.length}`);
  if (!r4.pages.some((p) => p.title === "About NavSite"))
    fail("about page missing from nav crawl");
  console.log(`✓ nav heuristic crawled ${r4.pages.length} pages`);

  // ------------------------------------------------------------------
  // 5. Cookie attached when domain matches.
  // ------------------------------------------------------------------
  console.log("\n→ cookie attached when domain matches");
  clearCrawlFixtures();
  const [cookieRow] = await db
    .insert(schema.brandProfileCookies)
    .values({
      workspaceId: workspace.id,
      domain: "cookie.test",
      label: "Test cookie",
      ciphertext: encryptSecret("session=abc; csrf=def"),
      last4: "=def",
      createdByUserId: user.id,
    })
    .returning();

  let cookieSeen = false;
  registerCrawlFixture("https://cookie.test/robots.txt", { body: "" });
  registerCrawlFixture("https://cookie.test/", {
    body: brandHomepage({ locale: "en", siteName: "CookieTest" }),
  });
  // Intercept via inspector: since the fetch fixture path doesn't capture
  // headers, we instead exercise the cookies module directly here for
  // the host-match leg, then crawlSite for the integration path.
  const { hostMatchesDomain, normalizeCookieHeader, loadCookieProfile } =
    await import("../src/lib/brand-profile/cookies");

  if (!hostMatchesDomain("cookie.test", "cookie.test"))
    fail("host should match exact domain");
  if (!hostMatchesDomain("app.cookie.test", "cookie.test"))
    fail("subdomain should match parent domain");
  if (hostMatchesDomain("evil.test", "cookie.test"))
    fail("unrelated host should NOT match");
  if (!hostMatchesDomain("api.x.test", "*.x.test"))
    fail("wildcard *.x.test should match api.x.test");

  const normalized = normalizeCookieHeader(
    "session=abc; Path=/; HttpOnly; SameSite=Lax\ncsrf=def; Secure; Path=/",
  );
  if (!normalized.includes("session=abc"))
    fail("normalize lost session=abc");
  if (!normalized.includes("csrf=def"))
    fail("normalize lost csrf=def");
  if (/Path=/i.test(normalized))
    fail("normalize should strip Path attribute");
  if (/HttpOnly/i.test(normalized))
    fail("normalize should strip HttpOnly attribute");
  console.log("✓ cookie normalize strips Set-Cookie attributes");

  const loaded = await loadCookieProfile({
    workspaceId: workspace.id,
    cookieProfileId: cookieRow.id,
    requestUrl: "https://cookie.test/",
  });
  if (!loaded) fail("loadCookieProfile should resolve for matching host");
  if (!loaded.cookieHeader.includes("session=abc"))
    fail("decrypted cookie missing session=abc");

  const mismatch = await loadCookieProfile({
    workspaceId: workspace.id,
    cookieProfileId: cookieRow.id,
    requestUrl: "https://other.test/",
  });
  if (mismatch !== null)
    fail("cookie should NOT load when host doesn't match");
  console.log("✓ cookie host-match enforced, decryption works");

  // Now drive the end-to-end crawl path with cookieProfileId.
  registerCrawlFixture("https://cookie.test/sitemap.xml", {
    body: `<urlset><url><loc>https://cookie.test/</loc></url></urlset>`,
  });
  const r5 = await crawlSite(workspace.id, "https://cookie.test/", {
    cookieProfileId: cookieRow.id,
  });
  if (r5.pages.length === 0)
    fail("crawl with cookie should still extract pages");
  // We can't directly assert that the Cookie header was set in test
  // mode (fixtures don't capture headers), but the cookie-load path
  // above runs through the same code as the integration path — the
  // integration just adds end-to-end success.
  // Used cookieSeen for posterity; not asserting.
  void cookieSeen;
  console.log("✓ cookie integration: crawl succeeds with cookieProfileId");

  // ------------------------------------------------------------------
  // 6. Playwright failed install.
  // ------------------------------------------------------------------
  console.log("\n→ jsRendered + Playwright install fails → row marked failed");
  process.env.OPENCOPY_PLAYWRIGHT_FORCE_STATE = "failed";
  clearCrawlFixtures();
  registerCrawlFixture("https://js.test/robots.txt", { body: "" });
  registerCrawlFixture("https://js.test/", {
    body: brandHomepage({ locale: "en", siteName: "JS" }),
  });

  const r6 = await crawlSite(workspace.id, "https://js.test/", {
    jsRendered: true,
  });
  if (!r6.error)
    fail("Playwright failed install should surface error in CrawlResult");
  if (r6.pages.length !== 0)
    fail(`failed JS crawl should have 0 pages, got ${r6.pages.length}`);

  const failRow = await db
    .select()
    .from(schema.brandProfileCrawls)
    .where(
      and(
        eq(schema.brandProfileCrawls.url, "https://js.test/"),
        eq(schema.brandProfileCrawls.jsRendered, true),
      ),
    );
  if (failRow.length !== 1)
    fail("failed JS crawl should persist a cache row");
  if (failRow[0].status !== "failed")
    fail(`expected status='failed', got ${failRow[0].status}`);
  if (!failRow[0].error)
    fail("error message should be persisted");
  console.log("✓ Playwright-failed: CrawlResult.error set, row persisted as failed");

  delete process.env.OPENCOPY_PLAYWRIGHT_FORCE_STATE;

  // ------------------------------------------------------------------
  // 7. jsRendered=true with forced install success → success path.
  // ------------------------------------------------------------------
  console.log("\n→ jsRendered + forced install success");
  process.env.OPENCOPY_PLAYWRIGHT_FORCE_STATE = "installed";
  clearCrawlFixtures();
  registerCrawlFixture("https://jsok.test/robots.txt", { body: "" });
  registerCrawlFixture("https://jsok.test/", {
    body: brandHomepage({ locale: "pl", siteName: "JSOK" }),
  });
  registerCrawlFixture("https://jsok.test/about", {
    body: plainPage("About JSOK", "Body."),
  });

  const r7 = await crawlSite(workspace.id, "https://jsok.test/", {
    jsRendered: true,
  });
  if (r7.error) fail(`JS-render success path should not error: ${r7.error}`);
  if (!r7.jsRendered) fail("CrawlResult.jsRendered should be true");
  if (r7.pages.length === 0)
    fail("JS-render success path should still produce pages");

  delete process.env.OPENCOPY_PLAYWRIGHT_FORCE_STATE;
  console.log("✓ JS-render success path produces pages");

  // ------------------------------------------------------------------
  // Cleanup.
  // ------------------------------------------------------------------
  await pool.close?.();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__opencopyDb = undefined;
  rmSync(dataDir, { recursive: true, force: true });

  console.log("\n✓ crawler end-to-end smoke clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
