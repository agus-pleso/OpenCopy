/**
 * Smoke test multi-locale detection.
 *
 *   - URL path detection per locale (/pl/, /ro/, /uk/, /en/).
 *   - Query string detection (?lang=pl, ?locale=pl-PL).
 *   - hreflang extraction with multiple regions.
 *   - Normalization: pl-PL → pl; ua → uk; unknown → null.
 *   - Aggregate `collectDetectedLocales` returns union from all signals.
 *
 * Run: pnpm tsx scripts/test-brand-profile-locale-detect.ts
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
  const {
    normalizeLocale,
    detectLocaleFromPath,
    detectLocaleFromQuery,
    detectLocaleFromUrl,
    extractHreflangs,
    detectPageLocale,
    collectDetectedLocales,
  } = await import("../src/lib/brand-profile/locale-detect");

  // ------------------------------------------------------------------
  // 1. normalize.
  // ------------------------------------------------------------------
  console.log("→ normalizeLocale");
  if (normalizeLocale("pl") !== "pl") fail("pl");
  if (normalizeLocale("PL") !== "pl") fail("PL (uppercase)");
  if (normalizeLocale("pl-PL") !== "pl") fail("pl-PL");
  if (normalizeLocale("en_US") !== "en") fail("en_US");
  if (normalizeLocale("ua") !== "uk") fail("ua → uk pragmatic mapping");
  if (normalizeLocale("de") !== null) fail("de should be null (unsupported)");
  if (normalizeLocale("") !== null) fail("empty should be null");
  console.log("✓ normalize covers supported + uk aliases");

  // ------------------------------------------------------------------
  // 2. path detection.
  // ------------------------------------------------------------------
  console.log("\n→ detectLocaleFromPath");
  if (detectLocaleFromPath("/pl/about") !== "pl") fail("/pl/about");
  if (detectLocaleFromPath("/about/pl") !== "pl") fail("/about/pl");
  if (detectLocaleFromPath("/ro/produs") !== "ro") fail("/ro/produs");
  if (detectLocaleFromPath("/uk/pro-nas") !== "uk") fail("/uk/pro-nas");
  if (detectLocaleFromPath("/en/blog/post-1") !== "en") fail("/en/blog/post-1");
  if (detectLocaleFromPath("/blog/2024") !== null)
    fail("/blog/2024 should not match");
  console.log("✓ path detection covers all 4 locales + nulls when absent");

  // ------------------------------------------------------------------
  // 3. query detection.
  // ------------------------------------------------------------------
  console.log("\n→ detectLocaleFromQuery");
  if (detectLocaleFromQuery("?lang=pl") !== "pl") fail("?lang=pl");
  if (detectLocaleFromQuery("?locale=pl-PL") !== "pl") fail("?locale=pl-PL");
  if (detectLocaleFromQuery("hl=ro") !== "ro") fail("hl=ro");
  if (detectLocaleFromQuery("?lang=xx") !== null) fail("unknown lang");
  if (detectLocaleFromQuery("") !== null) fail("empty");
  console.log("✓ query detection covers common keys");

  // ------------------------------------------------------------------
  // 4. full URL detection.
  // ------------------------------------------------------------------
  console.log("\n→ detectLocaleFromUrl");
  if (
    detectLocaleFromUrl("https://acme.com/pl/produkty") !== "pl"
  )
    fail("URL with /pl/");
  if (
    detectLocaleFromUrl("https://acme.com/products?locale=ro") !== "ro"
  )
    fail("URL with ?locale=ro");
  if (
    detectLocaleFromUrl("https://acme.com/about") !== null
  )
    fail("URL without signals");
  console.log("✓ full URL detection composes path + query");

  // ------------------------------------------------------------------
  // 5. hreflang extraction.
  // ------------------------------------------------------------------
  console.log("\n→ extractHreflangs");
  const html = `
    <link rel="alternate" hreflang="pl-PL" href="https://acme.com/pl/" />
    <link rel="alternate" hreflang="ro" href="https://acme.com/ro/" />
    <link rel="alternate" hreflang="x-default" href="https://acme.com/" />
    <link rel="alternate" hreflang="de" href="https://acme.com/de/" />
    <link href="https://acme.com/uk/" rel="alternate" hreflang="uk" />
  `;
  const alts = extractHreflangs(html);
  if (alts.length !== 3)
    fail(`expected 3 supported hreflangs (pl,ro,uk), got ${alts.length}`);
  const map = new Map(alts.map((a) => [a.locale, a.href]));
  if (!map.has("pl")) fail("pl hreflang missing");
  if (!map.has("ro")) fail("ro hreflang missing");
  if (!map.has("uk")) fail("uk hreflang missing");
  if (map.has("en") || map.has("de" as never))
    fail("x-default and de should be filtered");
  console.log("✓ hreflang extraction filters unsupported + x-default");

  // ------------------------------------------------------------------
  // 6. detectPageLocale combines signals.
  // ------------------------------------------------------------------
  console.log("\n→ detectPageLocale priority");
  // URL path wins.
  if (
    detectPageLocale({
      url: "https://acme.com/pl/about",
      html: '<link rel="alternate" hreflang="ro" href="x" />',
      defaultLocale: "en",
    }) !== "pl"
  ) {
    fail("URL path should win over hreflang");
  }
  // Single hreflang hint when URL gives no signal.
  if (
    detectPageLocale({
      url: "https://acme.com/about",
      html: '<link rel="alternate" hreflang="ro" href="x" />',
      defaultLocale: "en",
    }) !== "ro"
  ) {
    fail("single hreflang should be picked when URL has no signal");
  }
  // Falls back to default.
  if (
    detectPageLocale({
      url: "https://acme.com/about",
      html: "",
      defaultLocale: "pl",
    }) !== "pl"
  ) {
    fail("should fall back to default locale");
  }
  console.log("✓ priority is URL → single-hreflang → default");

  // ------------------------------------------------------------------
  // 7. collectDetectedLocales union.
  // ------------------------------------------------------------------
  console.log("\n→ collectDetectedLocales union");
  const detected = collectDetectedLocales({
    pages: [
      { url: "https://acme.com/", locale: "en" },
      { url: "https://acme.com/pl/about", locale: "pl" },
      { url: "https://acme.com/products?lang=ro", locale: "ro" },
    ],
    homepageHtml: html, // contains pl, ro, uk hreflangs
    defaultLocale: "en",
  });
  // Should have en (default + first page), pl (path + hreflang), ro
  // (query + hreflang), uk (hreflang) → 4 total.
  if (detected.length !== 4)
    fail(`expected 4 detected locales, got ${detected.length}: ${detected.join(",")}`);
  for (const expected of ["en", "pl", "ro", "uk"] as const) {
    if (!detected.includes(expected))
      fail(`missing ${expected} from detected union`);
  }
  console.log("✓ collectDetectedLocales returns union of all signals");

  console.log("\n✓ locale-detect smoke clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
