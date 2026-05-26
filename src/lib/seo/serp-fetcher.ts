import "server-only";
import { and, eq, gte } from "drizzle-orm";

import { db } from "@/db/client";
import { seoSerpCache, type Locale } from "@/db/schema";

import { defaultLocaleHeuristics } from "./locale-heuristics-shared";

/**
 * SERP fetcher (V1 quality scrape, not a full SerpAPI replacement).
 *
 * Reads `seo_serp_cache` first; on a non-expired hit, returns cached
 * results directly. On cache miss, hits `google.<tld>/search` with a
 * rotating UA, parses the result HTML to find the top-10 organic
 * URLs, then fetches each one in turn to extract title + h1 + h2 +
 * truncated body text.
 *
 * Constraints:
 *   - 2 req/s global rate limit (simple in-process token bucket).
 *   - Exponential backoff with ±30% jitter on 429/5xx (3 attempts).
 *   - Partial-success: a single failed result URL is skipped, not
 *     fatal — we'd rather return a 7-row cache than blow the audit.
 *   - 5000-char body truncation per result (matches the schema's
 *     content-gap design).
 *
 * Test mode: when `SEO_SERP_TEST_MODE=1`, the fetcher returns canned
 * fixture results without hitting the network. Used by the cache
 * smoke test.
 */

const USER_AGENTS = [
  // Recent stable Chrome on Windows.
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  // Recent stable Chrome on macOS.
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  // Recent Firefox on Windows.
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  // Recent Firefox on macOS.
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.3; rv:122.0) Gecko/20100101 Firefox/122.0",
];

const MAX_RESULTS = 10;
const BODY_TRUNCATE = 5000;
const PER_RESULT_TIMEOUT_MS = 12000;
const SERP_PAGE_TIMEOUT_MS = 15000;

/* ----------------------------------------------------------------------------
 * Rate limiter — simple token bucket, in-process. 2 req/s.
 * -------------------------------------------------------------------------- */

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async take(): Promise<void> {
    while (true) {
      const now = Date.now();
      const elapsed = (now - this.lastRefill) / 1000;
      const refill = elapsed * this.refillPerSec;
      if (refill > 0) {
        this.tokens = Math.min(this.capacity, this.tokens + refill);
        this.lastRefill = now;
      }
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitSec = (1 - this.tokens) / this.refillPerSec;
      await sleep(Math.max(50, waitSec * 1000));
    }
  }
}

const bucket = new TokenBucket(/*capacity*/ 2, /*refillPerSec*/ 2);

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/* ----------------------------------------------------------------------------
 * Network — fetch with retry + jitter.
 * -------------------------------------------------------------------------- */

async function rateLimitedFetch(
  url: string,
  opts: {
    timeoutMs?: number;
    maxAttempts?: number;
  } = {},
): Promise<{ status: number; body: string }> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await bucket.take();
    const controller = new AbortController();
    const t = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? SERP_PAGE_TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": pickUserAgent(),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
        signal: controller.signal,
        redirect: "follow",
      });
      const body = await res.text();
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (attempt === maxAttempts) {
          return { status: res.status, body };
        }
        // Exponential backoff with jitter.
        const base = Math.min(8000, 500 * 2 ** (attempt - 1));
        const jitter = base * (Math.random() * 0.6 - 0.3); // ±30%
        await sleep(base + jitter);
        continue;
      }
      return { status: res.status, body };
    } catch (e) {
      lastErr = e;
      if (attempt === maxAttempts) throw e;
      const base = Math.min(8000, 500 * 2 ** (attempt - 1));
      const jitter = base * (Math.random() * 0.6 - 0.3);
      await sleep(base + jitter);
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr ?? new Error("rateLimitedFetch: unreachable");
}

/* ----------------------------------------------------------------------------
 * HTML parsing — regex-based, defensive. Avoids adding node-html-parser.
 * -------------------------------------------------------------------------- */

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#34": '"',
};

export function decodeEntities(text: string): string {
  return text.replace(/&([a-z]+|#\d+);/gi, (_, ent) => {
    const lower = ent.toLowerCase();
    if (HTML_ENTITY_MAP[lower]) return HTML_ENTITY_MAP[lower];
    if (lower.startsWith("#")) {
      const code = parseInt(lower.slice(1), 10);
      if (!Number.isNaN(code) && code > 0 && code < 0x10ffff) {
        return String.fromCodePoint(code);
      }
    }
    return `&${ent};`;
  });
}

function stripTags(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the top-10 organic result URLs from a Google search page.
 * Uses two strategies in order:
 *   1. `div.g a[href]` shape — historically stable.
 *   2. Defensive regex on `<a href="/url?q=https://...">` — handles
 *      Google's older redirect format that still surfaces in some
 *      regions / when JS is suppressed.
 */
export function extractGoogleResultUrls(html: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  // Strategy 1: any anchor href that starts with /url?q= and is an
  // organic-looking outbound URL. Skip ads (which use /aclk?...).
  const re1 = /<a [^>]*href=["']\/url\?q=([^"'&]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(html))) {
    const url = decodeURIComponent(m[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    if (/google\.com\/aclk\?/.test(url)) continue;
    if (/google\./.test(url)) continue;
    if (/youtube\.com\/(?:results|@)/.test(url)) continue;
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
    if (urls.length >= MAX_RESULTS * 2) break;
  }

  // Strategy 2: fall back to direct https-anchored hrefs inside the
  // result container shape. This catches Google's "modern" layout.
  if (urls.length < MAX_RESULTS) {
    const re2 = /<a [^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
    while ((m = re2.exec(html))) {
      const url = m[1];
      if (/google\./.test(url)) continue;
      if (/googleadservices/.test(url)) continue;
      if (/doubleclick\.net/.test(url)) continue;
      if (/^https?:\/\/[^/]*googleusercontent/i.test(url)) continue;
      if (/^https?:\/\/webcache\./i.test(url)) continue;
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
      if (urls.length >= MAX_RESULTS * 2) break;
    }
  }

  return urls.slice(0, MAX_RESULTS);
}

export interface ParsedPage {
  title: string;
  h1?: string;
  h2: string[];
  fullText: string;
}

/**
 * Extract title + h1 + h2 list + a clean body excerpt from a fetched
 * HTML page. Lightweight: regex on the raw HTML. Truncates body to
 * `BODY_TRUNCATE` chars.
 */
export function parseResultPage(html: string): ParsedPage {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : "";

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? decodeEntities(stripTags(h1Match[1])) : undefined;

  const h2Matches = html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi);
  const h2 = Array.from(h2Matches)
    .map((m) => decodeEntities(stripTags(m[1])))
    .filter((s) => s.length > 0 && s.length <= 200)
    .slice(0, 20);

  // Main content extraction: prefer <main> / <article> if present,
  // else strip nav/header/footer/aside before pulling body text.
  const mainMatch =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ??
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  let bodyHtml: string;
  if (mainMatch) {
    bodyHtml = mainMatch[1];
  } else {
    bodyHtml = html
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
      .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, " ")
      .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, " ");
  }
  const text = decodeEntities(stripTags(bodyHtml));
  const fullText = text.slice(0, BODY_TRUNCATE);

  return { title, h1, h2, fullText };
}

/* ----------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------- */

export interface SerpResult {
  rank: number;
  url: string;
  title: string;
  h1?: string;
  h2: string[];
  fullText: string;
}

export interface FetchSerpArgs {
  workspaceId: string;
  keyword: string;
  locale: Locale;
}

/**
 * Test-mode hook. When `SEO_SERP_TEST_MODE=1`, this returns canned
 * fixture results instead of touching the network. Importable by test
 * scripts via the named export so they can swap in their own fixtures
 * if needed.
 */
export function getTestModeResults(args: FetchSerpArgs): SerpResult[] | null {
  if (process.env.SEO_SERP_TEST_MODE !== "1") return null;
  // Default canned fixture; tests can override by mutating
  // `__seoSerpTestFixtures` via the importable accessor below.
  const override = (globalThis as Record<string, unknown>)
    .__seoSerpTestFixtures as Record<string, SerpResult[]> | undefined;
  if (override) {
    const key = `${args.workspaceId}::${args.keyword}::${args.locale}`;
    if (key in override) return override[key];
    if ("default" in override) return override.default;
  }
  return [
    {
      rank: 1,
      url: "https://example.test/article-1",
      title: `${args.keyword} — przewodnik`,
      h1: args.keyword,
      h2: ["Wprowadzenie", "Zalety", "Cena", "Recenzje"],
      fullText: `Treść przykładowa dla ${args.keyword}. ` + "Lorem ipsum. ".repeat(50),
    },
    {
      rank: 2,
      url: "https://example.test/article-2",
      title: `${args.keyword} — co warto wiedzieć`,
      h1: `Wszystko o ${args.keyword}`,
      h2: ["Czym jest", "Cena", "Najlepsze opcje"],
      fullText: "Treść 2. " + "Dolor sit amet. ".repeat(40),
    },
  ];
}

/**
 * Read or write the SERP cache for a given (workspace, keyword, locale).
 * 24h freshness window. On cache miss, scrape Google and persist.
 */
export async function fetchSerp(args: FetchSerpArgs): Promise<SerpResult[]> {
  // Test mode: short-circuit before any DB or network call.
  const testFixture = getTestModeResults(args);
  if (testFixture && !args.workspaceId) {
    return testFixture;
  }

  const now = new Date();

  // 1. Cache lookup.
  const cached = await db.query.seoSerpCache.findFirst({
    where: and(
      eq(seoSerpCache.workspaceId, args.workspaceId),
      eq(seoSerpCache.keyword, args.keyword),
      eq(seoSerpCache.locale, args.locale),
      gte(seoSerpCache.expiresAt, now),
    ),
  });
  if (cached) {
    return cached.results.map((r) => ({
      rank: r.rank,
      url: r.url,
      title: r.title,
      h1: r.h1,
      h2: r.h2 ?? [],
      fullText: r.fullText,
    }));
  }

  // 2. Test mode (lookup-after-cache so the cache-hit branch is still
  //    exercisable in tests).
  if (testFixture) {
    await writeCache(args, testFixture);
    return testFixture;
  }

  // 3. Live scrape.
  const heuristics = defaultLocaleHeuristics(args.locale);
  const url = `https://${heuristics.searchDomain}/search?q=${encodeURIComponent(args.keyword)}&hl=${heuristics.searchHlCode}&num=10`;

  let resultUrls: string[];
  try {
    const { body } = await rateLimitedFetch(url, {
      timeoutMs: SERP_PAGE_TIMEOUT_MS,
    });
    resultUrls = extractGoogleResultUrls(body);
  } catch {
    // Catastrophic failure of the SERP page itself — return empty,
    // don't poison the cache.
    return [];
  }

  const results: SerpResult[] = [];
  for (let i = 0; i < resultUrls.length && results.length < MAX_RESULTS; i++) {
    const u = resultUrls[i];
    try {
      const { status, body } = await rateLimitedFetch(u, {
        timeoutMs: PER_RESULT_TIMEOUT_MS,
      });
      if (status >= 400) continue;
      const parsed = parseResultPage(body);
      results.push({
        rank: results.length + 1,
        url: u,
        title: parsed.title,
        h1: parsed.h1,
        h2: parsed.h2,
        fullText: parsed.fullText,
      });
    } catch {
      // Skip individual result on hard failure; keep going.
      continue;
    }
  }

  // 4. Persist (upsert).
  if (results.length > 0) {
    await writeCache(args, results);
  }

  return results;
}

async function writeCache(
  args: FetchSerpArgs,
  results: SerpResult[],
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  // Upsert: if a row exists (e.g., expired), overwrite it.
  const existing = await db.query.seoSerpCache.findFirst({
    where: and(
      eq(seoSerpCache.workspaceId, args.workspaceId),
      eq(seoSerpCache.keyword, args.keyword),
      eq(seoSerpCache.locale, args.locale),
    ),
  });
  if (existing) {
    await db
      .update(seoSerpCache)
      .set({
        results: results.map((r) => ({
          rank: r.rank,
          url: r.url,
          title: r.title,
          h1: r.h1,
          h2: r.h2,
          fullText: r.fullText,
        })),
        fetchedAt: now,
        expiresAt,
      })
      .where(eq(seoSerpCache.id, existing.id));
  } else {
    await db.insert(seoSerpCache).values({
      workspaceId: args.workspaceId,
      keyword: args.keyword,
      locale: args.locale,
      results: results.map((r) => ({
        rank: r.rank,
        url: r.url,
        title: r.title,
        h1: r.h1,
        h2: r.h2,
        fullText: r.fullText,
      })),
      fetchedAt: now,
      expiresAt,
    });
  }
}
