import "server-only";

import { load } from "cheerio";
import type { AnyNode } from "domhandler";

/**
 * Cheerio-based extraction for a single crawled HTML page.
 *
 * Returns: title, h1[], h2[], h3[], main body text (first 5000 chars,
 * with script/style/nav/footer/aside/header/form stripped).
 *
 * Cheerio makes this far more robust than the regex pass in serp-fetcher
 * (which exists there because the SEO pipeline already commits to a
 * dep-free posture). Brand-profile is allowed to take the dep — the
 * marketer's expectation is "extract clean copy from my own website".
 */

const BODY_TRUNCATE = 5000;

/**
 * Nav link selection: returns absolute hrefs that look like internal
 * navigation links matching one of the topical keywords. Used by
 * `crawler.ts` to pick "Top 5-7 pages" when there's no sitemap or the
 * sitemap is too long.
 *
 * Heuristic: link text or href substring contains one of:
 *   about | product | service | services | pricing | blog | features
 *
 * We exclude:
 *   - external hosts (anchors pointing off-origin)
 *   - links inside `<footer>` / `<aside>` (legal / ad blocks)
 *   - links with `rel="nofollow"` or `rel="sponsored"`
 */
const NAV_KEYWORDS = [
  "about",
  "product",
  "service",
  "services",
  "pricing",
  "blog",
  "features",
];

export interface ExtractedPage {
  title: string;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  text: string;
}

export function extractPage(html: string): ExtractedPage {
  const $ = load(html);

  const title = ($("title").first().text() || "").trim();

  const collect = (sel: string): string[] =>
    $(sel)
      .map((_: number, el: AnyNode) => $(el).text().replace(/\s+/g, " ").trim())
      .get()
      .filter((s: string) => s.length > 0);

  const headings = {
    h1: collect("h1").slice(0, 10),
    h2: collect("h2").slice(0, 50),
    h3: collect("h3").slice(0, 100),
  };

  // Body extraction: prefer `<main>` / `<article>` if present; else
  // strip noise from `<body>`. Drop script, style, noscript, nav, header,
  // footer, aside, form — same set as serp-fetcher's regex pass.
  const NOISE = "script, style, noscript, nav, header, footer, aside, form";
  let bodyText: string;
  const main = $("main").first();
  const article = $("article").first();
  if (main.length) {
    main.find(NOISE).remove();
    bodyText = main.text();
  } else if (article.length) {
    article.find(NOISE).remove();
    bodyText = article.text();
  } else {
    const body = $("body");
    body.find(NOISE).remove();
    bodyText = body.text();
  }
  bodyText = bodyText.replace(/\s+/g, " ").trim().slice(0, BODY_TRUNCATE);

  return { title, headings, text: bodyText };
}

/**
 * Find nav-target URLs on a homepage. Returns *absolute* URLs (resolved
 * against `baseUrl`). Caller is responsible for picking the cap (spec
 * says 6 additional pages).
 *
 * Same-origin only — we don't follow off-host nav (corporate sites
 * often link off to a different domain for "Pricing" via a marketing
 * landing page; that's out of scope for V1).
 */
export function findNavTargets(html: string, baseUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  const $ = load(html);

  // Drop footer/aside content first — these are ad / legal blocks that
  // can otherwise drown out real nav (e.g. a "Pricing" link in the
  // footer pointing at a separate landing page).
  $("footer, aside").remove();

  const seen = new Set<string>();
  const out: string[] = [];

  $("a[href]").each((_: number, el: AnyNode) => {
    const $el = $(el);
    const rel = ($el.attr("rel") ?? "").toLowerCase();
    if (rel.includes("nofollow") || rel.includes("sponsored")) return;
    const rawHref = ($el.attr("href") ?? "").trim();
    if (!rawHref) return;
    if (rawHref.startsWith("#")) return;
    if (rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return;

    let absolute: string;
    try {
      absolute = new URL(rawHref, baseUrl).toString();
    } catch {
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(absolute);
    } catch {
      return;
    }
    if (parsed.origin !== origin) return;
    // Normalize: strip fragments + trailing slash for de-dupe (keep the
    // canonical form in the output).
    const normalized = parsed.origin + parsed.pathname.replace(/\/+$/, "") +
      (parsed.search ?? "");

    if (seen.has(normalized)) return;

    const linkText = $el.text().toLowerCase();
    const hrefLower = absolute.toLowerCase();
    const isNav = NAV_KEYWORDS.some(
      (kw) => linkText.includes(kw) || hrefLower.includes(kw),
    );
    if (!isNav) return;

    seen.add(normalized);
    out.push(absolute);
  });

  return out;
}
