import "server-only";
import { and, eq, gte } from "drizzle-orm";

import { db } from "@/db/client";
import {
  brandProfileCrawls,
  type Locale,
} from "@/db/schema";

/**
 * brand_profile_crawl read/write helpers — 24h TTL semantics.
 *
 * The unique index on (workspaceId, url, jsRendered) means the cache
 * row is naturally upserted: every fresh crawl for the same combination
 * overwrites the previous row's payload + bumps `expiresAt`. The status
 * field gates whether a row is usable (`ready`) or a failed crawl that
 * we keep so the UI can surface the error.
 */

export const CRAWL_CACHE_TTL_HOURS = 24;
export const CRAWL_CACHE_TTL_MS = CRAWL_CACHE_TTL_HOURS * 60 * 60 * 1000;

export interface CachedCrawlPage {
  url: string;
  locale?: Locale;
  title: string;
  text: string;
  headings: { h1: string[]; h2: string[]; h3: string[] };
}

export interface CachedCrawlPayload {
  pages: CachedCrawlPage[];
  detectedLocales: Locale[];
  sitemapFound: boolean;
  robotsBlocked: boolean;
}

export interface CacheLookupArgs {
  workspaceId: string;
  url: string;
  jsRendered: boolean;
}

/**
 * Read a non-expired `ready` row. Returns null on miss / expiry /
 * failed-status. The caller decides whether to re-attempt — for failed
 * rows we return null so a retry path can re-write them, except when
 * the failure was robots-blocked which is sticky.
 */
export async function readCrawlCache(
  args: CacheLookupArgs,
): Promise<(CachedCrawlPayload & { finalUrl: string }) | null> {
  const now = new Date();
  const row = await db.query.brandProfileCrawls.findFirst({
    where: and(
      eq(brandProfileCrawls.workspaceId, args.workspaceId),
      eq(brandProfileCrawls.url, args.url),
      eq(brandProfileCrawls.jsRendered, args.jsRendered),
      gte(brandProfileCrawls.expiresAt, now),
    ),
  });
  if (!row) return null;
  if (row.status !== "ready") return null;
  if (!row.extractedContent) return null;
  return {
    finalUrl: row.finalUrl ?? row.url,
    pages: row.extractedContent.pages.map((p) => ({
      url: p.url,
      locale: p.locale,
      title: p.title,
      text: p.text,
      headings: p.headings,
    })),
    detectedLocales: row.extractedContent.detectedLocales,
    sitemapFound: row.extractedContent.sitemapFound,
    robotsBlocked: row.extractedContent.robotsBlocked,
  };
}

export interface CacheWriteArgs extends CacheLookupArgs {
  createdByUserId: string;
  finalUrl?: string;
  cookieProfileId?: string;
  status: "ready" | "failed";
  payload?: CachedCrawlPayload;
  error?: string;
}

/**
 * Upsert a crawl row by (workspace, url, jsRendered). Sets `expiresAt`
 * to now + 24h on `ready` writes; for `failed` writes we keep a much
 * shorter window (15 minutes) so the marketer can retry quickly after
 * fixing whatever caused the failure.
 */
export async function writeCrawlCache(args: CacheWriteArgs): Promise<void> {
  const now = new Date();
  const ttlMs = args.status === "ready" ? CRAWL_CACHE_TTL_MS : 15 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + ttlMs);

  const existing = await db.query.brandProfileCrawls.findFirst({
    where: and(
      eq(brandProfileCrawls.workspaceId, args.workspaceId),
      eq(brandProfileCrawls.url, args.url),
      eq(brandProfileCrawls.jsRendered, args.jsRendered),
    ),
  });

  const values = {
    workspaceId: args.workspaceId,
    url: args.url,
    finalUrl: args.finalUrl ?? args.url,
    jsRendered: args.jsRendered,
    cookieProfileId: args.cookieProfileId,
    status: args.status,
    extractedContent: args.payload ?? null,
    error: args.error ?? null,
    crawledAt: now,
    expiresAt,
    createdByUserId: args.createdByUserId,
  };

  if (existing) {
    await db
      .update(brandProfileCrawls)
      .set(values)
      .where(eq(brandProfileCrawls.id, existing.id));
  } else {
    await db.insert(brandProfileCrawls).values(values);
  }
}
