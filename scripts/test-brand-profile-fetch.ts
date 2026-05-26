/**
 * Smoke test the brand-profile crawler fetch wrapper.
 *
 *   - UA is the OpenCopyBot string.
 *   - Cookie header is injected when provided.
 *   - Rate limit: 2 req/s caps actual fetch concurrency (3 calls back-to-
 *     back stretch over ~500ms+).
 *   - Retry-with-jitter: 429 + 500 trigger up to 3 attempts; backoff
 *     intervals land in the expected ±30% window.
 *   - Test-mode fixture registry shortcuts the live fetch path entirely
 *     (asserted via a fetch spy).
 *
 * Run: pnpm tsx scripts/test-brand-profile-fetch.ts
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
    crawlFetch,
    OPENCOPY_USER_AGENT,
    registerCrawlFixture,
    clearCrawlFixtures,
    backoffWithJitter,
    resetCrawlRateLimiter,
    getCrawlFetchCallCount,
  } = await import("../src/lib/brand-profile/fetch");

  // ------------------------------------------------------------------
  // 1. Backoff jitter window.
  // ------------------------------------------------------------------
  console.log("→ backoff jitter window");
  for (let attempt = 1; attempt <= 3; attempt++) {
    const base = Math.min(8000, 500 * 2 ** (attempt - 1));
    const lo = base * 0.7;
    const hi = base * 1.3;
    for (let i = 0; i < 20; i++) {
      const v = backoffWithJitter(attempt);
      if (v < lo - 0.001 || v > hi + 0.001) {
        fail(
          `attempt ${attempt}: backoff ${v.toFixed(1)} outside [${lo.toFixed(
            1,
          )},${hi.toFixed(1)}]`,
        );
      }
    }
  }
  console.log("✓ jitter stays inside ±30% window for attempts 1-3");

  // ------------------------------------------------------------------
  // 2. Test-mode registry serves fixtures, no fetch call.
  // ------------------------------------------------------------------
  console.log("\n→ test-mode fixture serves without hitting fetch");
  process.env.OPENCOPY_CRAWL_TEST_MODE = "1";
  clearCrawlFixtures();

  registerCrawlFixture("https://example.test/home", {
    status: 200,
    body: "<html>hello</html>",
  });

  let spyCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    spyCalls++;
    throw new Error("fetch should not be called in test mode");
  }) as typeof fetch;

  const r1 = await crawlFetch("https://example.test/home");
  if (r1.status !== 200) fail(`expected status 200, got ${r1.status}`);
  if (!r1.body.includes("hello")) fail("body content not piped through");
  if (spyCalls !== 0) fail(`fetch was called ${spyCalls} times in test mode`);
  if (getCrawlFetchCallCount() !== 0)
    fail("test-mode hits should not increment the call counter");
  console.log("✓ fixture path skips real fetch");

  // Unregistered URL → 404 in test mode.
  const r404 = await crawlFetch("https://example.test/missing");
  if (r404.status !== 404)
    fail(`unregistered URL should return 404, got ${r404.status}`);
  console.log("✓ unregistered URL returns 404 in test mode");

  globalThis.fetch = realFetch;
  process.env.OPENCOPY_CRAWL_TEST_MODE = "";

  // ------------------------------------------------------------------
  // 3. UA + cookie header land on the outgoing request.
  // ------------------------------------------------------------------
  console.log("\n→ UA + Cookie header injection");
  resetCrawlRateLimiter();
  let capturedHeaders: Record<string, string> = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    capturedHeaders = init?.headers as Record<string, string>;
    return new Response("ok", { status: 200, headers: { "x-url": url } });
  }) as typeof fetch;

  await crawlFetch("https://example.test/headers", {
    cookieHeader: "session=abc; csrf=def",
  });
  if (capturedHeaders["User-Agent"] !== OPENCOPY_USER_AGENT)
    fail(`UA mismatch: ${capturedHeaders["User-Agent"]}`);
  if (capturedHeaders["Cookie"] !== "session=abc; csrf=def")
    fail(`Cookie header missing: ${capturedHeaders["Cookie"]}`);
  console.log("✓ UA = OpenCopyBot, Cookie header injected");

  // ------------------------------------------------------------------
  // 4. Retry on 500: 3 attempts, then return the last response.
  // ------------------------------------------------------------------
  console.log("\n→ retry on 5xx (3 attempts)");
  let attemptCount = 0;
  globalThis.fetch = (async () => {
    attemptCount++;
    return new Response("nope", { status: 500 });
  }) as typeof fetch;

  // Monkey-patch the global setTimeout to fast-forward backoff sleeps.
  const realSetTimeout = globalThis.setTimeout;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).setTimeout = ((fn: () => void, _ms: number) => {
    return realSetTimeout(fn, 0);
  }) as typeof setTimeout;
  // AbortController timeouts also use setTimeout — keep them at 0ms.

  resetCrawlRateLimiter();
  const r500 = await crawlFetch("https://example.test/retry-500", {
    timeoutMs: 1000,
    maxAttempts: 3,
  });
  if (attemptCount !== 3)
    fail(`expected 3 attempts on 500, got ${attemptCount}`);
  if (r500.status !== 500)
    fail(`final status should still be 500 after retries, got ${r500.status}`);
  console.log("✓ 5xx triggers 3 attempts");

  // ------------------------------------------------------------------
  // 5. 429 retry.
  // ------------------------------------------------------------------
  console.log("\n→ retry on 429");
  attemptCount = 0;
  globalThis.fetch = (async () => {
    attemptCount++;
    if (attemptCount < 2) {
      return new Response("slow down", { status: 429 });
    }
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
  resetCrawlRateLimiter();
  const r429 = await crawlFetch("https://example.test/retry-429");
  if (attemptCount !== 2)
    fail(`expected 2 attempts on 429-then-200, got ${attemptCount}`);
  if (r429.status !== 200)
    fail(`should succeed on 2nd attempt, got ${r429.status}`);
  console.log("✓ 429 retries and recovers");

  // ------------------------------------------------------------------
  // 6. Rate limit: 5 calls back-to-back should pace through the bucket.
  //    Capacity 2 + refill 2/s means 5 calls take roughly (5-2)/2 = 1.5s
  //    of bucket waits. We can't perfectly time-test here, but we can
  //    confirm the bucket logic by exhausting and observing the wait.
  // ------------------------------------------------------------------
  console.log("\n→ rate limit token bucket");
  // Restore real setTimeout so the bucket actually waits.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).setTimeout = realSetTimeout;
  resetCrawlRateLimiter();
  attemptCount = 0;
  globalThis.fetch = (async () => {
    attemptCount++;
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
  const start = Date.now();
  // 4 sequential calls — capacity 2 then 2 refills.
  for (let i = 0; i < 4; i++) {
    await crawlFetch(`https://example.test/rate-${i}`);
  }
  const elapsed = Date.now() - start;
  // At 2/s refill, calls 3+4 wait ~500ms each → ≥ 800ms total typical.
  // Allow some slack on slow CI: assert ≥ 400ms which is conservative.
  if (elapsed < 400) {
    fail(
      `4 calls completed too fast (${elapsed}ms) — rate limiter probably not engaged`,
    );
  }
  console.log(`✓ 4 calls paced over ${elapsed}ms (≥400ms required)`);

  // Restore real fetch.
  globalThis.fetch = realFetch;

  console.log("\n✓ brand-profile fetch smoke clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
