import "server-only";

import { crawlFetch } from "./fetch";

/**
 * Sitemap discovery + parse.
 *
 * Handles two shapes:
 *   - Plain `<urlset>` with `<url><loc>...</loc></url>` entries.
 *   - `<sitemapindex>` with `<sitemap><loc>...</loc></sitemap>` pointing
 *     at nested sitemap files — we recursively pull URLs from each one.
 *
 * Recursion is bounded: max 5 nested sitemaps explored per index, max 1
 * level of nesting deep (so a malicious site can't bomb us with an
 * infinite sitemap tree).
 *
 * Regex-based — same defensive parsing posture as serp-fetcher.ts. We
 * don't pull in an XML parser dep.
 */

const MAX_NESTED_SITEMAPS = 5;
const MAX_URLS_TOTAL = 500;

export interface SitemapResult {
  /** Was a sitemap.xml found at all (incl. through an index)? */
  found: boolean;
  urls: string[];
}

/**
 * Top-level entry — try `<origin>/sitemap.xml` first; if it 404s, return
 * `{ found: false, urls: [] }`. On any parse error, also `found: false`.
 */
export async function discoverSitemap(origin: string): Promise<SitemapResult> {
  const url = `${origin.replace(/\/+$/, "")}/sitemap.xml`;
  return fetchAndParseSitemap(url, /*depth*/ 0);
}

async function fetchAndParseSitemap(
  url: string,
  depth: number,
): Promise<SitemapResult> {
  try {
    const res = await crawlFetch(url, {
      timeoutMs: 12000,
      accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
    });
    if (res.status >= 400 || !res.body) return { found: false, urls: [] };
    const body = res.body;
    if (isSitemapIndex(body)) {
      if (depth > 0) {
        // Don't recurse below depth 1 — guard against pathological nesting.
        return { found: true, urls: [] };
      }
      const childUrls = extractLocs(body).slice(0, MAX_NESTED_SITEMAPS);
      const all: string[] = [];
      for (const childUrl of childUrls) {
        const child = await fetchAndParseSitemap(childUrl, depth + 1);
        for (const u of child.urls) {
          if (all.length >= MAX_URLS_TOTAL) break;
          all.push(u);
        }
        if (all.length >= MAX_URLS_TOTAL) break;
      }
      return { found: true, urls: all };
    }
    return { found: true, urls: extractLocs(body).slice(0, MAX_URLS_TOTAL) };
  } catch {
    return { found: false, urls: [] };
  }
}

/**
 * Heuristic: sitemap indexes use the `<sitemapindex>` root element.
 * Single-level sitemaps use `<urlset>`. We sniff by presence of the
 * sitemapindex tag — slightly faster than full XML parse.
 */
function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex\b/i.test(xml);
}

/**
 * Extract every `<loc>...</loc>` text content. Decodes XML entities and
 * trims whitespace. Filters to absolute http(s) URLs only.
 */
export function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const decoded = decodeXmlEntities(m[1].trim());
    if (/^https?:\/\//i.test(decoded)) {
      out.push(decoded);
    }
  }
  return out;
}

/**
 * Decode the five XML predefined entities. Numeric character references
 * (`&#NN;`) are also decoded since real sitemaps in CEE locales often
 * carry encoded diacritics.
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = parseInt(code, 10);
      return Number.isFinite(n) && n > 0 && n < 0x10ffff
        ? String.fromCodePoint(n)
        : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const n = parseInt(code, 16);
      return Number.isFinite(n) && n > 0 && n < 0x10ffff
        ? String.fromCodePoint(n)
        : _;
    });
}

/**
 * Parse a sitemap body directly (sync — no fetch). Exposed for tests and
 * for callers that already have the XML in memory.
 */
export function parseSitemap(xml: string): { isIndex: boolean; locs: string[] } {
  return { isIndex: isSitemapIndex(xml), locs: extractLocs(xml) };
}
