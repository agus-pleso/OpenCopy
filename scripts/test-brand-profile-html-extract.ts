/**
 * Smoke test cheerio-based HTML extraction.
 *
 *   - Title + h1 + h2 + h3 extraction.
 *   - Body text stripped of script/style/nav/footer/aside/header/form.
 *   - 5000-char truncation.
 *   - Pages without h1 still extract h2/h3.
 *   - <main> / <article> wrappers prefer those for body extraction.
 *   - findNavTargets returns same-origin nav links matching keywords.
 *   - Footer/aside nav links excluded.
 *   - rel=nofollow / sponsored excluded.
 *
 * Run: pnpm tsx scripts/test-brand-profile-html-extract.ts
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
  const { extractPage, findNavTargets } = await import(
    "../src/lib/brand-profile/html-extract"
  );

  // ------------------------------------------------------------------
  // 1. Full page extraction.
  // ------------------------------------------------------------------
  console.log("→ full page extraction");
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Acme — Marketing Automation</title>
  <style>body { font-size: 16px; } /* should be stripped */</style>
</head>
<body>
  <header><nav>menu links go here</nav></header>
  <main>
    <h1>Marketing Automation That Works</h1>
    <h2>Why Acme</h2>
    <p>We help marketers ship campaigns faster.</p>
    <h2>Pricing</h2>
    <p>Starts at $29/mo.</p>
    <h3>Free trial</h3>
    <p>14 days, no credit card required.</p>
    <script>console.log("noise");</script>
  </main>
  <footer>© 2025 Acme</footer>
</body>
</html>`;
  const result = extractPage(fullHtml);
  if (result.title !== "Acme — Marketing Automation")
    fail(`title mismatch: ${result.title}`);
  if (result.headings.h1.length !== 1 || result.headings.h1[0] !== "Marketing Automation That Works")
    fail("h1 extraction failed");
  if (result.headings.h2.length !== 2)
    fail(`h2 count: expected 2, got ${result.headings.h2.length}`);
  if (!result.headings.h2.includes("Pricing"))
    fail("h2 'Pricing' missing");
  if (result.headings.h3.length !== 1 || result.headings.h3[0] !== "Free trial")
    fail("h3 extraction failed");
  if (result.text.includes("menu links go here"))
    fail("nav content should be stripped");
  if (result.text.includes("© 2025 Acme"))
    fail("footer should be stripped");
  if (result.text.includes("console.log"))
    fail("script body should be stripped");
  if (!result.text.includes("ship campaigns faster"))
    fail("body text missing");
  console.log("✓ extracts title, h1, h2, h3, stripped body");

  // ------------------------------------------------------------------
  // 2. No <main>: falls back to body with noise stripped.
  // ------------------------------------------------------------------
  console.log("\n→ no <main>: body fallback");
  const noMain = `<html><body>
    <nav>nav noise</nav>
    <h1>Title</h1>
    <p>Real content.</p>
    <footer>footer noise</footer>
  </body></html>`;
  const r2 = extractPage(noMain);
  if (!r2.text.includes("Real content"))
    fail("body fallback should still extract content");
  if (r2.text.includes("nav noise"))
    fail("nav noise should be stripped in body fallback");
  if (r2.text.includes("footer noise"))
    fail("footer noise should be stripped in body fallback");
  console.log("✓ body fallback strips noise");

  // ------------------------------------------------------------------
  // 3. No h1: extraction still works.
  // ------------------------------------------------------------------
  console.log("\n→ no h1 page");
  const noH1 = `<html><head><title>X</title></head><body><h2>Sub-only</h2><p>Body.</p></body></html>`;
  const r3 = extractPage(noH1);
  if (r3.headings.h1.length !== 0)
    fail("h1 array should be empty");
  if (r3.headings.h2.length !== 1 || r3.headings.h2[0] !== "Sub-only")
    fail("h2 still extracted when h1 absent");
  console.log("✓ pages without h1 still extract h2");

  // ------------------------------------------------------------------
  // 4. Body truncation at 5000 chars.
  // ------------------------------------------------------------------
  console.log("\n→ body truncation");
  const longBody = `<html><body><main><p>${"x".repeat(20000)}</p></main></body></html>`;
  const r4 = extractPage(longBody);
  if (r4.text.length !== 5000)
    fail(`body should be truncated to 5000 chars, got ${r4.text.length}`);
  console.log("✓ body truncates to 5000 chars");

  // ------------------------------------------------------------------
  // 5. findNavTargets returns matching links.
  // ------------------------------------------------------------------
  console.log("\n→ findNavTargets");
  const navHtml = `<html><body>
    <nav>
      <a href="/about">About</a>
      <a href="/products">Products</a>
      <a href="/pricing">Pricing</a>
      <a href="/blog">Blog</a>
      <a href="/features">Features</a>
      <a href="/contact">Contact us</a>
      <a href="https://other.example/product">External Products</a>
      <a href="/about-team#leaders">Leadership</a>
      <a href="/sponsored-pricing" rel="sponsored">Sponsored Pricing</a>
    </nav>
    <footer>
      <a href="/about-careers">About Careers (in footer)</a>
    </footer>
  </body></html>`;
  const targets = findNavTargets(navHtml, "https://acme.com");
  if (!targets.some((u) => u.endsWith("/about")))
    fail("/about should be picked");
  if (!targets.some((u) => u.endsWith("/products")))
    fail("/products should be picked");
  if (!targets.some((u) => u.endsWith("/pricing")))
    fail("/pricing should be picked");
  if (!targets.some((u) => u.endsWith("/blog")))
    fail("/blog should be picked");
  if (!targets.some((u) => u.endsWith("/features")))
    fail("/features should be picked");
  if (targets.some((u) => u.includes("other.example")))
    fail("external host should not be picked");
  if (targets.some((u) => u.endsWith("/contact")))
    fail("contact has no keyword match — should NOT be picked");
  if (targets.some((u) => u.includes("sponsored-pricing")))
    fail("rel=sponsored link should be excluded");
  if (targets.some((u) => u.includes("about-careers")))
    fail("footer link should be excluded");
  console.log(`✓ nav targets: ${targets.length} matches (about/products/pricing/blog/features)`);

  // ------------------------------------------------------------------
  // 6. findNavTargets de-dupes by normalized URL.
  // ------------------------------------------------------------------
  console.log("\n→ findNavTargets de-dupes");
  const dupeHtml = `<html><body>
    <a href="/about">About</a>
    <a href="/about/">About slash</a>
    <a href="/about#leadership">About anchor</a>
  </body></html>`;
  const dedup = findNavTargets(dupeHtml, "https://acme.com");
  if (dedup.length !== 1)
    fail(`expected 1 deduped /about, got ${dedup.length}`);
  console.log("✓ /about variants collapse to one");

  console.log("\n✓ html-extract smoke clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
