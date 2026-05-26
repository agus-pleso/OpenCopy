import "server-only";

import { crawlFetch, OPENCOPY_USER_AGENT } from "./fetch";

/**
 * Minimal robots.txt parser + allow checker.
 *
 * Respects:
 *   - `User-agent: *` (wildcard rules).
 *   - `User-agent: OpenCopyBot` (our specific UA) if explicitly listed —
 *     wins over the wildcard block when present, per the standard's
 *     "most specific rule wins" semantics.
 *   - `Disallow:` paths (longest-prefix match → disallow).
 *   - `Allow:` paths (longest-prefix match → allow; ties to disallow lose).
 *
 * Does NOT parse Crawl-delay (we already pace at 2 req/s globally) or
 * sitemap declarations (the sitemap discovery path tries `/sitemap.xml`
 * directly — see `sitemap.ts`).
 *
 * A robots.txt that's missing, returns 404, or fails to fetch is treated
 * as "allow everything" — matches industry-standard crawler behaviour.
 */

interface RobotsRule {
  type: "allow" | "disallow";
  /** Original path pattern. Used for longest-prefix match. Wildcards `*`
   *  in the path are honoured. */
  pattern: string;
}

interface RobotsGroup {
  /** Lowercased UA tokens this group applies to. */
  userAgents: string[];
  rules: RobotsRule[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
}

/**
 * Parse a robots.txt body. Lenient: blank lines and unknown directives
 * are skipped; lines without `:` are skipped; comments (`#` to EOL) are
 * stripped before parsing each line.
 */
export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let collectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;

    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      if (!collectingAgents) {
        current = { userAgents: [value.toLowerCase()], rules: [] };
        groups.push(current);
        collectingAgents = true;
      } else if (current) {
        current.userAgents.push(value.toLowerCase());
      }
    } else if (key === "allow" || key === "disallow") {
      collectingAgents = false;
      if (!current) {
        // Rule before any UA — treat as wildcard group.
        current = { userAgents: ["*"], rules: [] };
        groups.push(current);
      }
      current.rules.push({ type: key, pattern: value });
    } else {
      // Other directives (Sitemap, Crawl-delay, Host, etc.) close out the
      // UA-collection phase but don't add a rule.
      collectingAgents = false;
    }
  }
  return { groups };
}

function stripComment(line: string): string {
  const i = line.indexOf("#");
  return i < 0 ? line : line.slice(0, i);
}

/**
 * Decide whether `urlPath` is allowed for our user-agent.
 *
 * Algorithm: pick the matching group with the most specific UA token
 * (specific > wildcard). Within that group, the rule with the longest
 * matching pattern wins; on a tie, `allow` beats `disallow` (per the
 * standard's clarification).
 */
export function isAllowed(parsed: ParsedRobots, urlPath: string): boolean {
  const ua = OPENCOPY_USER_AGENT.toLowerCase();
  // Prefer a group whose UA token appears in our UA string; fall back to *.
  let specific: RobotsGroup | undefined;
  let wildcard: RobotsGroup | undefined;
  for (const g of parsed.groups) {
    for (const a of g.userAgents) {
      if (a === "*" && !wildcard) wildcard = g;
      else if (a !== "*" && ua.includes(a)) {
        specific = g;
      }
    }
  }
  const group = specific ?? wildcard;
  if (!group || group.rules.length === 0) return true;

  let bestAllow = -1;
  let bestDisallow = -1;
  for (const r of group.rules) {
    if (!matchesPattern(r.pattern, urlPath)) continue;
    const len = r.pattern.length;
    if (r.type === "allow" && len > bestAllow) bestAllow = len;
    if (r.type === "disallow" && len > bestDisallow) bestDisallow = len;
  }
  if (bestAllow === -1 && bestDisallow === -1) return true;
  if (bestDisallow === -1) return true;
  if (bestAllow === -1) {
    // An explicit empty disallow ("Disallow:") means "allow everything".
    if (group.rules.find((r) => r.type === "disallow" && r.pattern === "")) {
      // Was there a non-empty disallow that also matched?
      const hasRealDisallow = group.rules.some(
        (r) => r.type === "disallow" && r.pattern !== "" && matchesPattern(r.pattern, urlPath),
      );
      if (!hasRealDisallow) return true;
    }
    return false;
  }
  if (bestAllow >= bestDisallow) return true;
  return false;
}

/**
 * Pattern matcher. Supports `*` wildcards inside the pattern and an `$`
 * anchor at the end. Prefix-match otherwise.
 */
function matchesPattern(pattern: string, path: string): boolean {
  if (pattern === "") return false; // see special-case in isAllowed
  // Empty pattern matched specially; full-site disallow is `/`.
  if (pattern === "/") return true;

  // Translate the pattern to a regex. Each `*` becomes `.*`. A trailing `$`
  // anchors to end. The pattern is a *prefix* match otherwise — robots.txt
  // doesn't anchor to start because every pattern implicitly starts with `/`.
  const anchorEnd = pattern.endsWith("$");
  const body = anchorEnd ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const re = new RegExp("^" + escaped + (anchorEnd ? "$" : ""));
  return re.test(path);
}

/**
 * Fetch + parse `<origin>/robots.txt`. Returns null on any error or 404 —
 * caller should treat null as "allow everything".
 */
export async function fetchRobots(origin: string): Promise<ParsedRobots | null> {
  const robotsUrl = `${origin.replace(/\/+$/, "")}/robots.txt`;
  try {
    const res = await crawlFetch(robotsUrl, {
      timeoutMs: 10000,
      accept: "text/plain,*/*;q=0.8",
    });
    if (res.status === 404 || res.status >= 400) return null;
    if (!res.body) return null;
    return parseRobots(res.body);
  } catch {
    return null;
  }
}

/**
 * Convenience: is the *entire* origin disallowed for us? Returns true
 * iff the root path is disallowed. Used by crawler.ts to short-circuit
 * with `robotsBlocked: true`.
 */
export function isOriginBlocked(parsed: ParsedRobots): boolean {
  return !isAllowed(parsed, "/");
}
