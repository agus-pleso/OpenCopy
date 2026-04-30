/**
 * Shared markdown-parsing primitives used by every agent that swapped from
 * `generateObject` to `generateText` + custom parser.
 *
 * Pure functions, no `server-only` import — exported for unit tests.
 */

export interface Section {
  /** Lowercased title with whitespace normalised. */
  title: string;
  /** Heading level (1 = `#`, 2 = `##`, 3 = `###`, 4 = `####`, 3 for **bold**). */
  level: number;
  /** Body text up to the next heading. */
  body: string;
}

const HEADING_RE = /^(?:(#{1,4})\s+(.+?)|\*\*(.+?)\*\*)\s*:?\s*$/gm;
const FENCE_OUTER_RE = /^\s*```(?:markdown|md)?\s*\n([\s\S]*)\n?```\s*$/i;

/** Strip a wrapping markdown fence and trim. */
export function unwrapMarkdown(raw: string): string {
  return raw.replace(FENCE_OUTER_RE, "$1").trim();
}

/** Split a markdown document into a list of sections. */
export function splitSections(md: string): Section[] {
  const cleaned = unwrapMarkdown(md);
  const matches: Array<{ title: string; level: number; start: number; end: number }> = [];
  HEADING_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEADING_RE.exec(cleaned))) {
    const level = m[1] ? m[1].length : 3;
    const title = (m[2] ?? m[3] ?? "").trim();
    matches.push({ title, level, start: m.index, end: m.index + m[0].length });
  }
  return matches.map((cur, i) => ({
    title: cur.title.toLowerCase(),
    level: cur.level,
    body: cleaned
      .slice(cur.end, matches[i + 1]?.start ?? cleaned.length)
      .trim(),
  }));
}

/**
 * Extract a labelled inline field from a section body. Matches both
 * `**Label:** value` and `Label: value` (case-insensitive). Multi-line values
 * are supported up to the next field-style line or blank line.
 */
export function pluckField(body: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*([\\s\\S]+?)(?=\\n\\s*(?:\\*\\*)?[A-Za-z][\\w ]+(?:\\*\\*)?\\s*:|\\n\\s*\\n|$)`,
    "im",
  );
  const m = body.match(re);
  if (!m) return undefined;
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * Return sections nested under `parent`. A section is "nested" when it appears
 * after `parent` in document order and at a deeper heading level than `parent`,
 * stopping when a section at parent's level (or shallower) is reached.
 */
export function childSections(sections: Section[], parent: Section): Section[] {
  const idx = sections.indexOf(parent);
  if (idx < 0) return [];
  const out: Section[] = [];
  for (let i = idx + 1; i < sections.length; i++) {
    const s = sections[i];
    if (s.level <= parent.level) break;
    out.push(s);
  }
  return out;
}

/** First section whose title matches one of the given keywords (lowercased). */
export function findSectionLike(
  sections: Section[],
  keywords: string[],
): Section | undefined {
  for (const k of keywords) {
    const exact = sections.find((s) => s.title === k);
    if (exact) return exact;
  }
  for (const k of keywords) {
    const partial = sections.find((s) => s.title.includes(k));
    if (partial) return partial;
  }
  return undefined;
}

/** Parse a comma-or-newline list. Strips bullets, quotes, trailing periods. */
export function parseCommaList(body: string | undefined, max: number): string[] {
  if (!body) return [];
  const items = body
    .split(/[,\n]/)
    .map((s) => s.replace(/^\s*[-*•]\s*/, "").trim())
    .map((s) => s.replace(/^["']|["']$/g, "").replace(/\.$/, "").trim())
    .filter((s) => s.length > 0 && s.length <= 80);
  return Array.from(new Set(items)).slice(0, max);
}

/** First non-empty trimmed line of a body. */
export function firstNonEmptyLine(body: string | undefined): string {
  if (!body) return "";
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}
