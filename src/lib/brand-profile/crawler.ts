import "server-only";

import type { Locale } from "@/db/schema";

/**
 * STUB — owned by Worktree B (crawler).
 *
 * This file is a contract-only placeholder so the extractor agent + brand
 * profile server actions compile in isolation. Worktree B will replace this
 * with the real Playwright + static-fetch implementation when it merges.
 *
 * The shape of `CrawlResult` is the agreed interface — keep this in sync
 * with `brand_profile_crawl.extractedContent` in `src/db/schema.ts`.
 */

export interface CrawlPage {
  url: string;
  locale?: Locale;
  title: string;
  text: string;
  headings: { h1: string[]; h2: string[]; h3: string[] };
}

export interface CrawlResult {
  finalUrl: string;
  pages: CrawlPage[];
  detectedLocales: Locale[];
  sitemapFound: boolean;
  robotsBlocked: boolean;
  jsRendered: boolean;
}

export interface CrawlOptions {
  jsRendered?: boolean;
  cookieProfileId?: string;
}

/**
 * Crawl a website and extract per-page content + per-page detected locale.
 *
 * STUB: throws on call. Worktree B implements:
 *  - HTTP fetch with sitemap + robots.txt awareness
 *  - Optional Playwright JS rendering when `jsRendered: true`
 *  - BYOK cookie injection when `cookieProfileId` resolves (decryptSecret)
 *  - Per-page locale detection (hreflang + URL path heuristics)
 *  - Limit ~20 pages per crawl, prioritising sitemap + homepage + about/pricing.
 */
export async function crawlSite(
  _workspaceId: string,
  _url: string,
  _options: CrawlOptions,
): Promise<CrawlResult> {
  throw new Error(
    "crawlSite() not yet implemented — Worktree B will ship the real crawler.",
  );
}
