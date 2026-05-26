import "server-only";

import type { Locale } from "@/db/schema";

/**
 * Multi-language detection for crawled pages. CEE-focused: we only emit
 * one of the four supported locales (en | pl | ro | uk). Detection is
 * strictly a *hint* — the agent caller still owns the final locale tag.
 *
 * Three signal sources, in priority order:
 *   1. URL path segment: `/pl/`, `/ro/`, `/uk/`, `/en/` (any position).
 *   2. URL query string: `?lang=pl`, `?locale=pl-PL`, etc.
 *   3. `<link rel="alternate" hreflang="...">` self-referencing tag.
 *
 * For batch detection across a crawl, we also expose `collectDetectedLocales`
 * which folds the per-page hints into a deduplicated array — that array
 * lands on `CrawlResult.detectedLocales`.
 */

export const SUPPORTED_LOCALES = ["en", "pl", "ro", "uk"] as const satisfies readonly Locale[];

/** Normalize a free-form locale string ("pl-PL", "en_US", "uk") to one
 *  of our four supported locales, or null if it doesn't map. */
export function normalizeLocale(raw: string): Locale | null {
  const lower = raw.trim().toLowerCase();
  if (!lower) return null;
  // Strip region: "pl-pl" → "pl". Accept dashes or underscores.
  const primary = lower.split(/[-_]/)[0];
  if ((SUPPORTED_LOCALES as readonly string[]).includes(primary)) {
    return primary as Locale;
  }
  // Special case: Ukrainian sometimes uses `ua` as the language tag in
  // the wild (incorrect under BCP 47, but pragmatic). Map to `uk`.
  if (primary === "ua") return "uk";
  return null;
}

/**
 * Detect locale from URL path. Returns the first matched segment, e.g.
 * `/pl/about` → "pl", `/about/pl` → "pl". Case-insensitive.
 */
export function detectLocaleFromPath(urlPath: string): Locale | null {
  const segments = urlPath.split("/").filter(Boolean);
  for (const seg of segments) {
    const norm = normalizeLocale(seg);
    if (norm) return norm;
  }
  return null;
}

/**
 * Detect locale from query string. Looks at common keys (`lang`, `locale`,
 * `hl`, `l`). Returns the first hit.
 */
export function detectLocaleFromQuery(search: string): Locale | null {
  if (!search) return null;
  const cleaned = search.startsWith("?") ? search.slice(1) : search;
  if (!cleaned) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(cleaned);
  } catch {
    return null;
  }
  for (const key of ["lang", "locale", "hl", "l"]) {
    const v = params.get(key);
    if (!v) continue;
    const norm = normalizeLocale(v);
    if (norm) return norm;
  }
  return null;
}

/**
 * Detect locale by combining path + query for a full URL. Returns the
 * first signal hit.
 */
export function detectLocaleFromUrl(url: string): Locale | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return (
    detectLocaleFromPath(parsed.pathname) ??
    detectLocaleFromQuery(parsed.search)
  );
}

/**
 * Pull every `<link rel="alternate" hreflang="...">` declaration out of
 * an HTML body. Returns an array of `{ locale, href }` for the hreflangs
 * we can normalize. Skips `x-default` and locales we don't support.
 */
export function extractHreflangs(
  html: string,
): Array<{ locale: Locale; href: string }> {
  const out: Array<{ locale: Locale; href: string }> = [];
  // Defensive: capture link tags with `rel="alternate"` and a hreflang
  // attribute. Tolerate attribute ordering — match the whole tag and
  // re-scan for both attrs inside.
  const tagRe = /<link\b[^>]*\brel\s*=\s*["']alternate["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    const tag = m[0];
    const hreflangMatch = tag.match(/\bhreflang\s*=\s*["']([^"']+)["']/i);
    const hrefMatch = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hreflangMatch || !hrefMatch) continue;
    const norm = normalizeLocale(hreflangMatch[1]);
    if (!norm) continue;
    out.push({ locale: norm, href: hrefMatch[1] });
  }
  return out;
}

/**
 * Detect the locale a *specific* page is in by combining all three
 * signals. URL path and query take precedence over hreflang because the
 * latter often only names *other* localized versions (a hreflang block
 * on the `/en/` page might list `pl,ro,uk` but not `en` itself).
 *
 * Falls back to `defaultLocale` if no signal matches.
 */
export function detectPageLocale(args: {
  url: string;
  html?: string;
  defaultLocale: Locale;
}): Locale {
  const fromUrl = detectLocaleFromUrl(args.url);
  if (fromUrl) return fromUrl;
  if (args.html) {
    const alternates = extractHreflangs(args.html);
    // If exactly one hreflang exists, that's a strong signal.
    if (alternates.length === 1) return alternates[0].locale;
    // Otherwise fall back to default.
  }
  return args.defaultLocale;
}

/**
 * Given a batch of (url, html) pairs from a single crawl, return the
 * union of detected locales. Used to set `CrawlResult.detectedLocales`.
 *
 * Signals come from URL detection on every page (cheap) plus hreflangs
 * on the homepage (often the most comprehensive set on a multi-locale
 * site).
 */
export function collectDetectedLocales(args: {
  pages: Array<{ url: string; locale?: Locale }>;
  homepageHtml?: string;
  defaultLocale: Locale;
}): Locale[] {
  const seen = new Set<Locale>();
  seen.add(args.defaultLocale);
  for (const p of args.pages) {
    if (p.locale) seen.add(p.locale);
    const fromUrl = detectLocaleFromUrl(p.url);
    if (fromUrl) seen.add(fromUrl);
  }
  if (args.homepageHtml) {
    for (const a of extractHreflangs(args.homepageHtml)) {
      seen.add(a.locale);
    }
  }
  return Array.from(seen);
}
