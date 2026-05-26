import "server-only";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { workspaces, type Locale } from "@/db/schema";

import {
  CRAWL_CACHE_TTL_MS,
  readCrawlCache,
  writeCrawlCache,
  type CachedCrawlPayload,
} from "./cache";
import { loadCookieProfile } from "./cookies";
import { crawlFetch } from "./fetch";
import { extractPage, findNavTargets } from "./html-extract";
import {
  collectDetectedLocales,
  detectPageLocale,
} from "./locale-detect";
import {
  ensurePlaywright,
  renderWithPlaywright,
} from "./playwright-lazy";
import {
  fetchRobots,
  isAllowed,
  isOriginBlocked,
  type ParsedRobots,
} from "./robots";
import { discoverSitemap } from "./sitemap";

/* ----------------------------------------------------------------------------
 * Public types — the contract Worktree A consumes.
 * -------------------------------------------------------------------------- */

export interface CrawlResultPage {
  url: string;
  locale?: Locale;
  title: string;
  text: string;
  headings: { h1: string[]; h2: string[]; h3: string[] };
}

export interface CrawlResult {
  finalUrl: string;
  pages: CrawlResultPage[];
  detectedLocales: Locale[];
  sitemapFound: boolean;
  robotsBlocked: boolean;
  jsRendered: boolean;
  /** Set when the crawl couldn't complete (e.g. Playwright install failed).
   *  The cache row also carries this — UI surfaces it. */
  error?: string;
}

export interface CrawlOptions {
  jsRendered?: boolean;
  cookieProfileId?: string;
}

/* ----------------------------------------------------------------------------
 * Per-crawl tuning knobs.
 * -------------------------------------------------------------------------- */

/** Cap on the number of pages we fetch per crawl. Spec: 5-7 pages. We
 *  set the cap at 7 (1 homepage + 6 nav targets). */
const MAX_PAGES_PER_CRAWL = 7;
/** If the sitemap has more than this many URLs, fall back to the
 *  nav-heuristic path. */
const SITEMAP_BIG_THRESHOLD = 50;
/** Per-page request timeout. */
const PER_PAGE_TIMEOUT_MS = 15000;

/* ----------------------------------------------------------------------------
 * Entry point.
 * -------------------------------------------------------------------------- */

/**
 * Crawl a marketer's website and return a `CrawlResult` ready for the
 * brand-profile pipeline. Persists the result in `brand_profile_crawl`
 * with a 24h TTL.
 *
 * Behaviour:
 *   - Cache hit (24h TTL) on (workspaceId, url, jsRendered): short-circuit.
 *   - robots.txt blocks the origin: persist a row with `robotsBlocked: true`
 *     and return empty pages.
 *   - Sitemap discovery: try `/sitemap.xml`; respect 50-URL cap.
 *   - Page selection: homepage + nav targets matching about/product/etc.
 *   - JS render: lazy-Playwright path; on install failure, return a
 *     `failed` row with a clear error message rather than crashing.
 */
export async function crawlSite(
  workspaceId: string,
  url: string,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const jsRendered = options.jsRendered === true;
  const normalizedUrl = normalizeInputUrl(url);

  // 1. Cache lookup.
  const cached = await readCrawlCache({
    workspaceId,
    url: normalizedUrl,
    jsRendered,
  });
  if (cached) {
    return {
      finalUrl: cached.finalUrl,
      pages: cached.pages,
      detectedLocales: cached.detectedLocales,
      sitemapFound: cached.sitemapFound,
      robotsBlocked: cached.robotsBlocked,
      jsRendered,
    };
  }

  // 2. Look up the workspace's default locale (used as a fallback for
  //    pages we couldn't otherwise locale-tag).
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  if (!ws) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  const defaultLocale = ws.defaultLocale;
  const createdByUserId = ws.createdByUserId;

  // 3. Cookie profile load (if any).
  let cookieHeader: string | undefined;
  if (options.cookieProfileId) {
    const loaded = await loadCookieProfile({
      workspaceId,
      cookieProfileId: options.cookieProfileId,
      requestUrl: normalizedUrl,
    });
    cookieHeader = loaded?.cookieHeader;
  }

  // 4. Playwright readiness check (only when jsRendered requested).
  if (jsRendered) {
    const ready = await ensurePlaywright();
    if (!ready.ok) {
      const errPayload: CachedCrawlPayload = {
        pages: [],
        detectedLocales: [defaultLocale],
        sitemapFound: false,
        robotsBlocked: false,
      };
      await writeCrawlCache({
        workspaceId,
        url: normalizedUrl,
        jsRendered,
        createdByUserId,
        cookieProfileId: options.cookieProfileId,
        finalUrl: normalizedUrl,
        status: "failed",
        payload: errPayload,
        error: ready.error,
      });
      return {
        finalUrl: normalizedUrl,
        pages: [],
        detectedLocales: [defaultLocale],
        sitemapFound: false,
        robotsBlocked: false,
        jsRendered,
        error: ready.error,
      };
    }
  }

  // 5. Compute origin from the input URL so robots.txt and sitemap.xml
  //    discovery targets the right host.
  let origin: string;
  try {
    origin = new URL(normalizedUrl).origin;
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // 6. Fetch + parse robots.txt. Missing robots.txt → null → treat as
  //    "allow everything".
  const robots = await fetchRobots(origin);
  if (robots && isOriginBlocked(robots)) {
    const payload: CachedCrawlPayload = {
      pages: [],
      detectedLocales: [defaultLocale],
      sitemapFound: false,
      robotsBlocked: true,
    };
    await writeCrawlCache({
      workspaceId,
      url: normalizedUrl,
      jsRendered,
      createdByUserId,
      cookieProfileId: options.cookieProfileId,
      finalUrl: normalizedUrl,
      status: "ready",
      payload,
    });
    return {
      finalUrl: normalizedUrl,
      pages: [],
      detectedLocales: [defaultLocale],
      sitemapFound: false,
      robotsBlocked: true,
      jsRendered,
    };
  }

  // 7. Fetch the homepage (always — even when a sitemap exists we want
  //    the homepage's hreflang block for locale detection).
  let homepage;
  try {
    homepage = jsRendered
      ? await renderWithPlaywright({
          url: normalizedUrl,
          cookieHeader,
          timeoutMs: PER_PAGE_TIMEOUT_MS,
        })
      : await crawlFetch(normalizedUrl, {
          cookieHeader,
          timeoutMs: PER_PAGE_TIMEOUT_MS,
        });
  } catch (e) {
    const errMsg = `Failed to fetch homepage: ${(e as Error).message}`;
    const payload: CachedCrawlPayload = {
      pages: [],
      detectedLocales: [defaultLocale],
      sitemapFound: false,
      robotsBlocked: false,
    };
    await writeCrawlCache({
      workspaceId,
      url: normalizedUrl,
      jsRendered,
      createdByUserId,
      cookieProfileId: options.cookieProfileId,
      finalUrl: normalizedUrl,
      status: "failed",
      payload,
      error: errMsg,
    });
    return {
      finalUrl: normalizedUrl,
      pages: [],
      detectedLocales: [defaultLocale],
      sitemapFound: false,
      robotsBlocked: false,
      jsRendered,
      error: errMsg,
    };
  }
  const finalUrl = homepage.finalUrl || normalizedUrl;

  // 8. Sitemap discovery — happens against the *final* origin (in case
  //    the input URL redirected to a different host, e.g. www. → apex).
  let finalOrigin: string;
  try {
    finalOrigin = new URL(finalUrl).origin;
  } catch {
    finalOrigin = origin;
  }
  const sitemap = await discoverSitemap(finalOrigin);

  // 9. Choose URL set:
  //    - Sitemap with ≤50 URLs: use those, capped at MAX_PAGES_PER_CRAWL.
  //    - Sitemap with >50 URLs OR no sitemap: nav-heuristic from homepage.
  let candidateUrls: string[] = [];
  let usedSitemap = false;
  if (sitemap.found && sitemap.urls.length > 0 && sitemap.urls.length <= SITEMAP_BIG_THRESHOLD) {
    candidateUrls = sitemap.urls.slice(0, MAX_PAGES_PER_CRAWL);
    usedSitemap = true;
  } else {
    const navTargets = findNavTargets(homepage.body, finalUrl).slice(
      0,
      MAX_PAGES_PER_CRAWL - 1,
    );
    candidateUrls = [finalUrl, ...navTargets].slice(0, MAX_PAGES_PER_CRAWL);
  }
  if (!usedSitemap && !candidateUrls.includes(finalUrl)) {
    candidateUrls.unshift(finalUrl);
    candidateUrls = candidateUrls.slice(0, MAX_PAGES_PER_CRAWL);
  }

  // 10. Filter against robots.txt allow-list (origin-scoped).
  if (robots) {
    candidateUrls = candidateUrls.filter((u) => urlAllowed(u, robots));
  }

  // 11. Fetch + extract every selected page. The homepage we already
  //     have in `homepage` — reuse it to avoid the double fetch.
  const pages: CrawlResultPage[] = [];
  for (const u of candidateUrls) {
    if (pages.length >= MAX_PAGES_PER_CRAWL) break;
    let html: string;
    if (u === finalUrl || u === normalizedUrl) {
      html = homepage.body;
    } else {
      try {
        const res = jsRendered
          ? await renderWithPlaywright({
              url: u,
              cookieHeader,
              timeoutMs: PER_PAGE_TIMEOUT_MS,
            })
          : await crawlFetch(u, {
              cookieHeader,
              timeoutMs: PER_PAGE_TIMEOUT_MS,
            });
        if (res.status >= 400) continue;
        html = res.body;
      } catch {
        continue;
      }
    }
    const extracted = extractPage(html);
    const locale = detectPageLocale({
      url: u,
      html,
      defaultLocale,
    });
    pages.push({
      url: u,
      locale,
      title: extracted.title,
      text: extracted.text,
      headings: extracted.headings,
    });
  }

  // 12. Aggregate detected locales.
  const detectedLocales = collectDetectedLocales({
    pages,
    homepageHtml: homepage.body,
    defaultLocale,
  });

  const payload: CachedCrawlPayload = {
    pages,
    detectedLocales,
    sitemapFound: sitemap.found,
    robotsBlocked: false,
  };

  await writeCrawlCache({
    workspaceId,
    url: normalizedUrl,
    jsRendered,
    createdByUserId,
    cookieProfileId: options.cookieProfileId,
    finalUrl,
    status: "ready",
    payload,
  });

  return {
    finalUrl,
    pages,
    detectedLocales,
    sitemapFound: sitemap.found,
    robotsBlocked: false,
    jsRendered,
  };
}

/* ----------------------------------------------------------------------------
 * Helpers.
 * -------------------------------------------------------------------------- */

/**
 * Add `https://` if the user pasted a bare domain ("acme.com" instead of
 * "https://acme.com"). Trim trailing whitespace. Don't otherwise
 * canonicalize — we want the original URL to be the cache key so a
 * marketer who switches "/" to "/about" gets a fresh row.
 */
function normalizeInputUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function urlAllowed(url: string, robots: ParsedRobots): boolean {
  try {
    const parsed = new URL(url);
    return isAllowed(robots, parsed.pathname + parsed.search);
  } catch {
    return false;
  }
}

/**
 * Exposed solely for tests that want to assert the TTL constant matches
 * the spec without re-reading the cache module.
 */
export const CRAWL_TTL_MS = CRAWL_CACHE_TTL_MS;
