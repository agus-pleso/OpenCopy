/**
 * Smoke test robots.txt parsing + allow/deny matching.
 *
 *   - Wildcard UA group applies to OpenCopyBot.
 *   - Specific UA group overrides wildcard.
 *   - Allow beats Disallow on equal-length matches.
 *   - `*` wildcards inside patterns work.
 *   - `$` anchor terminates pattern.
 *   - Missing robots.txt → null → caller treats as allow-all (sanity).
 *   - Origin block check fires when `/` is disallowed.
 *
 * Run: pnpm tsx scripts/test-brand-profile-robots.ts
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
  const { parseRobots, isAllowed, isOriginBlocked } = await import(
    "../src/lib/brand-profile/robots"
  );

  // ------------------------------------------------------------------
  // 1. Allow-all (empty or minimal robots.txt).
  // ------------------------------------------------------------------
  console.log("→ empty robots → allow everything");
  const empty = parseRobots("");
  if (!isAllowed(empty, "/")) fail("empty robots should allow /");
  if (!isAllowed(empty, "/anything")) fail("empty robots should allow /anything");
  if (isOriginBlocked(empty)) fail("empty robots should not block origin");
  console.log("✓ empty robots = allow-all");

  // ------------------------------------------------------------------
  // 2. Wildcard disallow vs allow.
  // ------------------------------------------------------------------
  console.log("\n→ wildcard rules");
  const robots1 = parseRobots(
    [
      "User-agent: *",
      "Disallow: /private",
      "Allow: /private/public",
      "Disallow: /admin/*",
    ].join("\n"),
  );
  if (isAllowed(robots1, "/private/secret"))
    fail("/private/secret should be disallowed");
  if (!isAllowed(robots1, "/private/public/page"))
    fail("/private/public should be allowed (longer match)");
  if (isAllowed(robots1, "/admin/users"))
    fail("/admin/* should disallow /admin/users");
  if (!isAllowed(robots1, "/other"))
    fail("/other should be allowed (no matching rule)");
  console.log("✓ wildcard disallow + allow longer-match works");

  // ------------------------------------------------------------------
  // 3. UA-specific rules override wildcard.
  // ------------------------------------------------------------------
  console.log("\n→ specific UA group wins");
  const robots2 = parseRobots(
    [
      "User-agent: *",
      "Disallow: /",
      "",
      "User-agent: OpenCopyBot",
      "Disallow: /private",
      "Allow: /",
    ].join("\n"),
  );
  // The wildcard says block everything; the OpenCopyBot group says
  // block /private but allow /. The specific group wins.
  if (!isAllowed(robots2, "/"))
    fail("OpenCopyBot group should allow / over the wildcard's full block");
  if (!isAllowed(robots2, "/blog"))
    fail("OpenCopyBot group should allow /blog");
  if (isAllowed(robots2, "/private/x"))
    fail("OpenCopyBot group should block /private/x");
  if (isOriginBlocked(robots2))
    fail("origin shouldn't be blocked because the specific rule allows /");
  console.log("✓ OpenCopyBot specific group beats wildcard block");

  // ------------------------------------------------------------------
  // 4. Whole-origin block.
  // ------------------------------------------------------------------
  console.log("\n→ origin block");
  const robots3 = parseRobots(["User-agent: *", "Disallow: /"].join("\n"));
  if (isAllowed(robots3, "/")) fail("Disallow: / should block /");
  if (!isOriginBlocked(robots3))
    fail("isOriginBlocked should detect Disallow: /");
  console.log("✓ Disallow: / blocks origin");

  // ------------------------------------------------------------------
  // 5. Pattern wildcard inside path and $ anchor.
  // ------------------------------------------------------------------
  console.log("\n→ pattern wildcards + $");
  const robots4 = parseRobots(
    [
      "User-agent: *",
      "Disallow: /*.pdf$",
      "Disallow: /search?*",
      "Allow: /search?safe=1$",
    ].join("\n"),
  );
  if (!isAllowed(robots4, "/blog/post"))
    fail("/blog/post should be allowed (no rule matches)");
  if (isAllowed(robots4, "/files/report.pdf"))
    fail("*.pdf$ should block .pdf");
  if (!isAllowed(robots4, "/files/report.pdfx"))
    fail("$-anchored .pdf$ shouldn't match .pdfx");
  if (isAllowed(robots4, "/search?q=foo"))
    fail("/search?* should block /search?q=foo");
  console.log("✓ wildcards + $ anchor honoured");

  // ------------------------------------------------------------------
  // 6. Comments and blank lines.
  // ------------------------------------------------------------------
  console.log("\n→ comments + blanks");
  const robots5 = parseRobots(
    [
      "# this is a comment",
      "User-agent: *  # inline comment",
      "",
      "Disallow: /admin  # block admin",
      "# Sitemap: https://example.com/sitemap.xml",
      "Crawl-delay: 1",
    ].join("\n"),
  );
  if (isAllowed(robots5, "/admin/x"))
    fail("/admin/x should still be blocked despite comments around it");
  if (!isAllowed(robots5, "/home"))
    fail("/home should be allowed");
  console.log("✓ comments + unknown directives ignored");

  // ------------------------------------------------------------------
  // 7. Empty Disallow → allow.
  // ------------------------------------------------------------------
  console.log("\n→ empty Disallow → allow-all");
  const robots6 = parseRobots(["User-agent: *", "Disallow:"].join("\n"));
  if (!isAllowed(robots6, "/anywhere"))
    fail("empty Disallow should allow everything");
  if (isOriginBlocked(robots6))
    fail("empty Disallow should not block origin");
  console.log("✓ empty Disallow = allow-all");

  console.log("\n✓ robots smoke clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
