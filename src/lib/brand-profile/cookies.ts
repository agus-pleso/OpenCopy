import "server-only";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { brandProfileCookies } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";

/**
 * BYOK cookie loader.
 *
 * The marketer pastes a raw cookie-header string (e.g.
 * `session=abc; csrf=def`) via Worktree A's `saveCookieProfile` action.
 * That writes a `brand_profile_cookie` row with the plaintext encrypted
 * via `encryptSecret` from `src/lib/crypto.ts`.
 *
 * This loader is the read side: given a cookie profile id and the URL
 * we're about to fetch, decrypt the plaintext and return it iff the
 * cookie row's `domain` actually matches the URL's host. The domain
 * check prevents a marketer's Notion cookie from being sent to an
 * unrelated site through some config slip-up.
 *
 * Decrypted plaintext is NEVER persisted past the function's return —
 * the caller (`crawler.ts`) attaches it as an in-memory `Cookie:` header
 * for the duration of a single fetch.
 */

export interface LoadedCookie {
  cookieHeader: string;
  domain: string;
  label: string;
}

/**
 * Domain match: cookie row's `domain` matches the request URL's host iff
 *   - exact host match, or
 *   - subdomain of the cookie's domain (e.g. cookie="example.com" matches
 *     "app.example.com"), or
 *   - cookie domain starts with `*.` and the URL host is under that
 *     wildcard.
 */
export function hostMatchesDomain(host: string, cookieDomain: string): boolean {
  const h = host.toLowerCase();
  let d = cookieDomain.toLowerCase().trim();
  if (d.startsWith("*.")) {
    d = d.slice(2);
    return h === d || h.endsWith("." + d);
  }
  if (h === d) return true;
  return h.endsWith("." + d);
}

/**
 * Load a cookie row scoped to a workspace and decrypt it. Returns null
 * (with a server-side log) when:
 *   - The row doesn't exist for that workspace (treat as "no cookie",
 *     don't crash the crawl).
 *   - The cookie's domain doesn't match the request URL's host.
 *   - Decryption fails (corrupt ciphertext or wrong ENCRYPTION_KEY).
 */
export async function loadCookieProfile(args: {
  workspaceId: string;
  cookieProfileId: string;
  requestUrl: string;
}): Promise<LoadedCookie | null> {
  const row = await db.query.brandProfileCookies.findFirst({
    where: and(
      eq(brandProfileCookies.id, args.cookieProfileId),
      eq(brandProfileCookies.workspaceId, args.workspaceId),
    ),
  });
  if (!row) return null;

  let host: string;
  try {
    host = new URL(args.requestUrl).host;
  } catch {
    return null;
  }
  if (!hostMatchesDomain(host, row.domain)) {
    return null;
  }
  try {
    const plaintext = decryptSecret(row.ciphertext);
    return {
      cookieHeader: normalizeCookieHeader(plaintext),
      domain: row.domain,
      label: row.label,
    };
  } catch {
    return null;
  }
}

/**
 * The marketer may paste either:
 *   a) A Set-Cookie–style line: `name=value; Path=/; HttpOnly; ...`
 *   b) A raw cookie header: `name=value; name2=value2`
 *
 * For request-side use we need shape (b). This strips Set-Cookie
 * attributes (Path, Domain, HttpOnly, Secure, SameSite, Expires, Max-Age)
 * and collapses everything else into `name=value; name=value; ...`.
 */
export function normalizeCookieHeader(raw: string): string {
  // First, split on newlines — multiple Set-Cookie lines might be pasted.
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return "";

  const ATTRS = new Set([
    "path",
    "domain",
    "expires",
    "max-age",
    "httponly",
    "secure",
    "samesite",
    "priority",
    "partitioned",
  ]);

  const pairs: string[] = [];
  for (const line of lines) {
    // Each line is `name=value; attr=v; attr; ...` — first segment is the
    // cookie itself; the rest are attributes we drop.
    const segments = line.split(";").map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
      const eq = seg.indexOf("=");
      const name = (eq < 0 ? seg : seg.slice(0, eq)).trim().toLowerCase();
      // Skip Set-Cookie attribute tokens.
      if (ATTRS.has(name)) continue;
      // Skip standalone tokens (HttpOnly/Secure live in the attr list
      // above, but be defensive about misspellings).
      if (eq < 0) continue;
      pairs.push(seg);
    }
  }
  return pairs.join("; ");
}
