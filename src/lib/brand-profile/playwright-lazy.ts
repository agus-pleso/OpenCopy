import "server-only";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { OPENCOPY_USER_AGENT } from "./fetch";

/**
 * Lazy Playwright loader.
 *
 * Spec: `playwright-core` ships with the install but bundles ZERO
 * Chromium bytes. On the first JS-render request we attempt
 * `npx playwright install chromium --with-deps` programmatically. If
 * that succeeds, Chromium lands in the project-local cache and we
 * proceed. If the install fails (no network, no permission, npx
 * missing) we surface a clean error string the caller can put on
 * `CrawlResult.error`.
 *
 * State (success-or-failure) gets stamped into a JSON file under
 * `OPENCOPY_DATA_DIR` (or `~/.opencopy/`) so we only attempt the
 * install once per environment. The marketer can delete the file to
 * force a retry.
 */

interface PlaywrightState {
  state: "installed" | "failed";
  /** Error string for `failed` state — surface to the UI. */
  error?: string;
  /** When the install ran (ms). */
  recordedAt: number;
}

const STATE_FILE_NAME = "playwright-state.json";
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function stateDir(): string {
  const dataDir = process.env.OPENCOPY_DATA_DIR;
  if (dataDir) return dataDir;
  return join(homedir(), ".opencopy");
}

function stateFilePath(): string {
  return join(stateDir(), STATE_FILE_NAME);
}

function readState(): PlaywrightState | null {
  try {
    const buf = readFileSync(stateFilePath(), "utf8");
    return JSON.parse(buf) as PlaywrightState;
  } catch {
    return null;
  }
}

function writeState(state: PlaywrightState): void {
  try {
    const dir = stateDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(stateFilePath(), JSON.stringify(state, null, 2));
  } catch {
    // Best-effort — if we can't persist the state file we'll just
    // re-attempt the install next time. Not fatal.
  }
}

/**
 * Test-mode short-circuit. Spec: under `OPENCOPY_CRAWL_TEST_MODE=1`,
 * everything that would touch the network or spawn a child process is
 * stubbed. Tests can pre-populate the state file via the env var
 * `OPENCOPY_PLAYWRIGHT_FORCE_STATE` (=`installed` | `failed`) to
 * exercise both branches.
 */
function testModeOverride(): PlaywrightState | null {
  if (process.env.OPENCOPY_CRAWL_TEST_MODE !== "1") return null;
  const forced = process.env.OPENCOPY_PLAYWRIGHT_FORCE_STATE;
  if (forced === "installed") {
    return { state: "installed", recordedAt: Date.now() };
  }
  if (forced === "failed") {
    return {
      state: "failed",
      error: "Forced failure in test mode.",
      recordedAt: Date.now(),
    };
  }
  return null;
}

/**
 * Ensure Chromium is installed. Returns:
 *   - `{ ok: true }` if installed (or already installed previously).
 *   - `{ ok: false, error }` if install failed (or was already cached
 *     as failed and we're not re-attempting).
 *
 * Cached state means we don't attempt again until the marketer clears
 * it — the error message they see ("we couldn't download Chromium")
 * also tells them how to retry manually.
 */
export async function ensurePlaywright(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const testHit = testModeOverride();
  if (testHit) {
    return testHit.state === "installed"
      ? { ok: true }
      : { ok: false, error: testHit.error ?? "Test-mode failure" };
  }

  const cached = readState();
  if (cached) {
    return cached.state === "installed"
      ? { ok: true }
      : { ok: false, error: cached.error ?? "Previous install failed" };
  }

  const installResult = await runPlaywrightInstall();
  writeState({
    state: installResult.ok ? "installed" : "failed",
    error: installResult.ok ? undefined : installResult.error,
    recordedAt: Date.now(),
  });
  return installResult;
}

function runPlaywrightInstall(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const cmd = isWindows ? "npx.cmd" : "npx";
    const args = ["playwright", "install", "chromium"];
    // `--with-deps` is Linux-only (apt-get for OS libraries). Skip
    // elsewhere to avoid the install bailing on macOS / Windows.
    if (process.platform === "linux") args.push("--with-deps");

    let proc;
    try {
      proc = spawn(cmd, args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: isWindows,
      });
    } catch (e) {
      resolve({
        ok: false,
        error: `Failed to spawn npx: ${(e as Error).message}`,
      });
      return;
    }

    let stderr = "";
    proc.stderr?.on("data", (d) => {
      stderr += String(d);
    });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({
        ok: false,
        error: "Playwright install timed out after 5 minutes",
      });
    }, INSTALL_TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true });
      else {
        const reason = stderr.trim().split("\n").slice(-3).join(" ") ||
          `exit code ${code}`;
        resolve({
          ok: false,
          error: `JS rendering needs Chromium — we couldn't download it: ${reason}. Try the static path or install Chromium manually.`,
        });
      }
    });

    proc.on("error", (e) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error: `Playwright install failed: ${(e as Error).message}`,
      });
    });
  });
}

/**
 * Render one URL via Playwright. Throws if Chromium isn't installed —
 * callers should run `ensurePlaywright()` first and handle the error
 * branch.
 *
 * Test-mode: returns a canned `<html>...</html>` body assembled from
 * the same fixture registry the static fetch uses, so end-to-end tests
 * can exercise the JS-render path without launching a real browser.
 */
export async function renderWithPlaywright(args: {
  url: string;
  cookieHeader?: string;
  timeoutMs?: number;
}): Promise<{ status: number; body: string; finalUrl: string }> {
  if (process.env.OPENCOPY_CRAWL_TEST_MODE === "1") {
    // Test mode: defer to the static fetch fixture registry so tests
    // get the same canned content through either path.
    const { crawlFetch } = await import("./fetch");
    const res = await crawlFetch(args.url, {
      cookieHeader: args.cookieHeader,
      timeoutMs: args.timeoutMs,
    });
    return {
      status: res.status,
      body: res.body,
      finalUrl: res.finalUrl,
    };
  }

  // Dynamic import — playwright-core is a peer dep we only touch when
  // actually rendering. Keeps the cold-start small.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pw = (await import("playwright-core")) as any;
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: OPENCOPY_USER_AGENT,
    });
    if (args.cookieHeader) {
      // Convert the joined cookie header into structured cookies for
      // Playwright. The marketer paste is already normalized to
      // `name=value; ...` shape via cookies.ts.
      const cookies = args.cookieHeader.split(";").map((pair) => {
        const [name, ...rest] = pair.trim().split("=");
        return {
          name: name.trim(),
          value: rest.join("=").trim(),
          url: args.url,
        };
      });
      try {
        await context.addCookies(cookies);
      } catch {
        // Bad cookie pair — don't fail the render, just skip cookies.
      }
    }
    const page = await context.newPage();
    const response = await page.goto(args.url, {
      waitUntil: "domcontentloaded",
      timeout: args.timeoutMs ?? 20000,
    });
    const body = await page.content();
    const status = response?.status() ?? 200;
    const finalUrl = page.url();
    return { status, body, finalUrl };
  } finally {
    await browser.close();
  }
}
