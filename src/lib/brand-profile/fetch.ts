import "server-only";

/**
 * Brand-profile crawler fetch — wraps `fetch` with:
 *   - A consistent OpenCopyBot User-Agent (honest beats sneaky for a tool
 *     that runs against a marketer's own site).
 *   - A 2 req/s in-process global rate limiter (token bucket).
 *   - Retry-with-jitter on 429/5xx (3 attempts; exponential backoff with
 *     ±30% jitter, capped at 8s).
 *   - Optional Cookie header injection (for BYOK login-gated content).
 *   - Test-mode injection: when `OPENCOPY_CRAWL_TEST_MODE=1`, the registry
 *     in `globalThis.__opencopyCrawlFixtures` answers every URL without
 *     touching the network. Used by the crawler smoke tests and by the
 *     end-to-end test that exercises the full pipeline.
 *
 * Mirrors the SEO SERP fetcher patterns (`src/lib/seo/serp-fetcher.ts`)
 * so the two stay easy to reason about together.
 */

export const OPENCOPY_USER_AGENT =
  "Mozilla/5.0 (compatible; OpenCopyBot/1.0; +https://github.com/agus-pleso/OpenCopy)";

const RATE_LIMIT_PER_SEC = 2;
const RATE_LIMIT_CAPACITY = 2;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 8000;

/* ----------------------------------------------------------------------------
 * Token bucket — shared across one process, refilled at RATE_LIMIT_PER_SEC.
 * `take()` blocks until a token is available. Identical shape to the SERP
 * fetcher's bucket — kept here as its own copy so the brand-profile crawl
 * gets its own pacing (one bucket per subsystem).
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

  /** Test-only: reset the bucket. Lets `scripts/test-brand-profile-fetch.ts`
   *  run without inheriting pacing state from earlier cases. */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

const bucket = new TokenBucket(RATE_LIMIT_CAPACITY, RATE_LIMIT_PER_SEC);

export function resetCrawlRateLimiter(): void {
  bucket.reset();
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/* ----------------------------------------------------------------------------
 * Test-mode fixture registry — keyed by absolute URL. Tests register canned
 * responses; the crawler.ts pipeline calls into `crawlFetch` and gets the
 * fixture body back without any DNS / TCP / TLS work.
 * -------------------------------------------------------------------------- */

export interface CrawlFetchFixture {
  status?: number;
  body: string;
  /** Final URL after redirects, if the fixture is simulating a redirect chain. */
  finalUrl?: string;
  /** Optional headers map for testing robots.txt content-type quirks etc. */
  headers?: Record<string, string>;
}

interface CrawlFixturesStore {
  byUrl: Map<string, CrawlFetchFixture>;
  /** Optional default fixture for unmatched URLs; useful for "everything 404"
   *  test scenarios. */
  default?: CrawlFetchFixture;
}

declare global {
  // eslint-disable-next-line no-var
  var __opencopyCrawlFixtures: CrawlFixturesStore | undefined;
  // eslint-disable-next-line no-var
  var __opencopyCrawlFetchCalls: number | undefined;
}

function ensureStore(): CrawlFixturesStore {
  if (!globalThis.__opencopyCrawlFixtures) {
    globalThis.__opencopyCrawlFixtures = { byUrl: new Map() };
  }
  return globalThis.__opencopyCrawlFixtures;
}

/** Register a canned response for one URL. */
export function registerCrawlFixture(
  url: string,
  fixture: CrawlFetchFixture,
): void {
  ensureStore().byUrl.set(url, fixture);
}

/** Set a default fallback for un-registered URLs. */
export function setDefaultCrawlFixture(fixture: CrawlFetchFixture): void {
  ensureStore().default = fixture;
}

/** Drop every fixture between test cases. */
export function clearCrawlFixtures(): void {
  globalThis.__opencopyCrawlFixtures = { byUrl: new Map() };
  globalThis.__opencopyCrawlFetchCalls = 0;
}

/** Number of times the real fetch path was entered. Test mode never
 *  increments this — useful for asserting "we didn't hit the network". */
export function getCrawlFetchCallCount(): number {
  return globalThis.__opencopyCrawlFetchCalls ?? 0;
}

/* ----------------------------------------------------------------------------
 * Public API — `crawlFetch`.
 * -------------------------------------------------------------------------- */

export interface CrawlFetchOptions {
  /** Cookie header value (already-joined `name=value; name2=value2` string). */
  cookieHeader?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  /** Override Accept header (e.g. `text/xml` for sitemaps). */
  accept?: string;
}

export interface CrawlFetchResult {
  status: number;
  body: string;
  finalUrl: string;
  headers: Headers;
}

/**
 * Test-mode short-circuit. When `OPENCOPY_CRAWL_TEST_MODE=1`, every call
 * resolves against the in-memory fixture registry.
 */
function maybeTestModeFetch(
  url: string,
): { status: number; body: string; finalUrl: string; headers: Headers } | null {
  if (process.env.OPENCOPY_CRAWL_TEST_MODE !== "1") return null;
  const store = ensureStore();
  const fixture = store.byUrl.get(url) ?? store.default;
  if (!fixture) {
    // No explicit fixture — return a 404 so the crawler's error paths
    // exercise the expected shape ("URL not registered" surfaces as a
    // miss rather than a crash).
    return {
      status: 404,
      body: "",
      finalUrl: url,
      headers: new Headers(),
    };
  }
  const headers = new Headers(fixture.headers ?? {});
  return {
    status: fixture.status ?? 200,
    body: fixture.body,
    finalUrl: fixture.finalUrl ?? url,
    headers,
  };
}

/**
 * Rate-limited, retrying fetch. Plain function — no class wrapper, so tests
 * can swap `globalThis.fetch` if they want raw-network-level control.
 */
export async function crawlFetch(
  url: string,
  opts: CrawlFetchOptions = {},
): Promise<CrawlFetchResult> {
  const testHit = maybeTestModeFetch(url);
  if (testHit) return testHit;

  globalThis.__opencopyCrawlFetchCalls =
    (globalThis.__opencopyCrawlFetchCalls ?? 0) + 1;

  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers: Record<string, string> = {
    "User-Agent": OPENCOPY_USER_AGENT,
    Accept:
      opts.accept ??
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,pl;q=0.8,ro;q=0.7,uk;q=0.6",
  };
  if (opts.cookieHeader) {
    headers["Cookie"] = opts.cookieHeader;
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await bucket.take();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers,
        signal: controller.signal,
        redirect: "follow",
      });
      const body = await res.text();
      const result: CrawlFetchResult = {
        status: res.status,
        body,
        finalUrl: res.url || url,
        headers: res.headers,
      };
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (attempt === maxAttempts) return result;
        await sleep(backoffWithJitter(attempt));
        continue;
      }
      return result;
    } catch (e) {
      lastErr = e;
      if (attempt === maxAttempts) throw e;
      await sleep(backoffWithJitter(attempt));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr ?? new Error("crawlFetch: unreachable");
}

/**
 * Exposed for the smoke test so it can assert backoff lands within the
 * expected ±30% jitter window without exercising real timing variance.
 */
export function backoffWithJitter(attempt: number): number {
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** (attempt - 1));
  const jitter = base * (Math.random() * 0.6 - 0.3); // ±30%
  return base + jitter;
}
