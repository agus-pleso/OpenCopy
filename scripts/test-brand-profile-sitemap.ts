/**
 * Smoke test sitemap parsing.
 *
 *   - Plain `<urlset>` returns its `<loc>` array.
 *   - `<sitemapindex>` is detected and the parser flags it.
 *   - Recursive discovery flattens a sitemapindex via the fixture
 *     registry (one level deep).
 *   - XML entities (`&amp;`, `&#260;`) decode correctly.
 *   - Non-http URLs are filtered.
 *   - Missing sitemap.xml → `{ found: false, urls: [] }`.
 *
 * Run: pnpm tsx scripts/test-brand-profile-sitemap.ts
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

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
  process.env.OPENCOPY_CRAWL_TEST_MODE = "1";
  const { parseSitemap, discoverSitemap } = await import(
    "../src/lib/brand-profile/sitemap"
  );
  const { registerCrawlFixture, clearCrawlFixtures } = await import(
    "../src/lib/brand-profile/fetch"
  );

  // ------------------------------------------------------------------
  // 1. Plain urlset parse.
  // ------------------------------------------------------------------
  console.log("→ plain urlset parse");
  const urlsetBody = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2025-01-01</lastmod>
  </url>
  <url>
    <loc>https://example.com/about</loc>
  </url>
  <url>
    <loc>https://example.com/pricing&amp;plan=pro</loc>
  </url>
  <url>
    <loc>https://example.com/&#260;</loc>
  </url>
  <url>
    <loc>javascript:alert(1)</loc>
  </url>
</urlset>`;
  const parsed = parseSitemap(urlsetBody);
  if (parsed.isIndex) fail("urlset shouldn't flag as sitemap index");
  if (parsed.locs.length !== 4)
    fail(`expected 4 locs (javascript: filtered), got ${parsed.locs.length}`);
  if (!parsed.locs.includes("https://example.com/pricing&plan=pro"))
    fail("entity decode failed");
  if (!parsed.locs.some((l) => l.includes("Ą")))
    fail("numeric char ref didn't decode (expected Ą)");
  console.log("✓ urlset parse + entity decode + scheme filter");

  // ------------------------------------------------------------------
  // 2. sitemapindex detection.
  // ------------------------------------------------------------------
  console.log("\n→ sitemapindex detection");
  const indexBody = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-pages.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap-posts.xml</loc>
  </sitemap>
</sitemapindex>`;
  const parsedIndex = parseSitemap(indexBody);
  if (!parsedIndex.isIndex) fail("sitemapindex not flagged");
  if (parsedIndex.locs.length !== 2)
    fail(`expected 2 nested sitemap locs, got ${parsedIndex.locs.length}`);
  console.log("✓ sitemapindex detection works");

  // ------------------------------------------------------------------
  // 3. Recursive discovery: register an index + nested children.
  // ------------------------------------------------------------------
  console.log("\n→ recursive discoverSitemap walks index → children");
  clearCrawlFixtures();
  registerCrawlFixture("https://acme.test/sitemap.xml", { body: indexBody });
  registerCrawlFixture("https://example.com/sitemap-pages.xml", {
    body: `<urlset><url><loc>https://acme.test/page-a</loc></url><url><loc>https://acme.test/page-b</loc></url></urlset>`,
  });
  registerCrawlFixture("https://example.com/sitemap-posts.xml", {
    body: `<urlset><url><loc>https://acme.test/post-1</loc></url></urlset>`,
  });

  const discovered = await discoverSitemap("https://acme.test");
  if (!discovered.found) fail("recursion should report sitemap found");
  if (discovered.urls.length !== 3)
    fail(`expected 3 flattened URLs, got ${discovered.urls.length}`);
  if (!discovered.urls.includes("https://acme.test/page-a"))
    fail("page-a missing from flattened sitemap");
  if (!discovered.urls.includes("https://acme.test/post-1"))
    fail("post-1 missing from flattened sitemap");
  console.log("✓ index + children → 3 flattened URLs");

  // ------------------------------------------------------------------
  // 4. Missing sitemap → found:false.
  // ------------------------------------------------------------------
  console.log("\n→ missing sitemap → found:false");
  clearCrawlFixtures(); // every URL now 404s in test mode
  const missing = await discoverSitemap("https://nope.test");
  if (missing.found) fail("missing sitemap should not be flagged as found");
  if (missing.urls.length !== 0)
    fail("missing sitemap should return empty urls");
  console.log("✓ 404 sitemap → found:false");

  // ------------------------------------------------------------------
  // 5. Nested depth cap — sitemap that points to another sitemap index
  //    should NOT recurse infinitely.
  // ------------------------------------------------------------------
  console.log("\n→ nested depth cap");
  clearCrawlFixtures();
  registerCrawlFixture("https://deep.test/sitemap.xml", {
    body: `<sitemapindex><sitemap><loc>https://deep.test/level-1.xml</loc></sitemap></sitemapindex>`,
  });
  registerCrawlFixture("https://deep.test/level-1.xml", {
    body: `<sitemapindex><sitemap><loc>https://deep.test/level-2.xml</loc></sitemap></sitemapindex>`,
  });
  registerCrawlFixture("https://deep.test/level-2.xml", {
    body: `<urlset><url><loc>https://deep.test/deepest</loc></url></urlset>`,
  });
  const deep = await discoverSitemap("https://deep.test");
  if (!deep.found) fail("nested index still counts as found");
  // depth 0 → level-1 (depth 1). At depth 1, when we encounter another
  // sitemapindex, we bail and return empty for that branch.
  // So the result should have 0 URLs.
  if (deep.urls.length !== 0)
    fail(
      `nested sitemapindex at depth 1 should bail; got ${deep.urls.length} urls`,
    );
  console.log("✓ depth-1 sitemapindex bails (no infinite recursion)");

  console.log("\n✓ sitemap smoke clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
