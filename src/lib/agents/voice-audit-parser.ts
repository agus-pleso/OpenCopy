/**
 * Pure parser for voice auditor output. Lives outside server-only so it can
 * be tested directly from a Node script.
 */

const KNOWN_CATEGORIES = [
  "tone",
  "do_violation",
  "dont_violation",
  "forbidden_word",
  "missing_required",
  "reading_level",
  "audience_mismatch",
  "other",
] as const;

export type AuditIssueCategory = (typeof KNOWN_CATEGORIES)[number];
export type AuditIssueSeverity = "low" | "medium" | "high";

export interface VoiceAuditIssue {
  excerpt: string;
  category: AuditIssueCategory;
  severity: AuditIssueSeverity;
  explanation: string;
  suggestion?: string;
}

export interface VoiceAudit {
  overall_score: number;
  summary: string;
  strengths: string[];
  issues: VoiceAuditIssue[];
}

function splitSections(md: string): Array<{ title: string; body: string; level: number }> {
  const cleaned = md
    .replace(/^\s*```(?:markdown|md)?\s*\n([\s\S]*)\n?```\s*$/i, "$1")
    .trim();
  const headingRe = /^(?:(#{1,4})\s+(.+?)|\*\*(.+?)\*\*)\s*:?\s*$/gm;
  const matches: Array<{ title: string; level: number; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(cleaned))) {
    const level = m[1] ? m[1].length : 3;
    const title = (m[2] ?? m[3] ?? "").trim();
    matches.push({ title, level, start: m.index, end: m.index + m[0].length });
  }
  return matches.map((cur, i) => ({
    title: cur.title,
    level: cur.level,
    body: cleaned
      .slice(cur.end, matches[i + 1]?.start ?? cleaned.length)
      .trim(),
  }));
}

function pluckField(body: string, label: string): string | undefined {
  const re = new RegExp(
    `^\\s*(?:\\*\\*)?${label.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(?:\\*\\*)?\\s*:\\s*([\\s\\S]+?)(?=\\n\\s*(?:\\*\\*)?[A-Za-z][\\w ]+(?:\\*\\*)?\\s*:|\\n\\s*$|$)`,
    "im",
  );
  const m = body.match(re);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

function normalizeSeverity(raw: string | undefined): AuditIssueSeverity {
  if (!raw) return "medium";
  const s = raw.trim().toLowerCase();
  if (/(high|critical|major|severe|block|ship.?block)/.test(s)) return "high";
  if (/(low|minor|polish|nit|small)/.test(s)) return "low";
  return "medium";
}

function normalizeCategory(raw: string | undefined): AuditIssueCategory {
  if (!raw) return "other";
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (KNOWN_CATEGORIES.includes(s as AuditIssueCategory)) {
    return s as AuditIssueCategory;
  }
  if (/forbidden|banned/.test(s)) return "forbidden_word";
  if (/missing|required/.test(s)) return "missing_required";
  if (/^do[._-]?violation|^do_/.test(s) || /breaks?_?do/.test(s)) return "do_violation";
  if (/^don'?t|dont_violation|breaks?_?don/.test(s)) return "dont_violation";
  if (/reading|grade|level/.test(s)) return "reading_level";
  if (/audience|persona|reader/.test(s)) return "audience_mismatch";
  if (/tone|voice/.test(s)) return "tone";
  return "other";
}

function parseScore(body: string | undefined): number {
  if (!body) return 50;
  const m = body.match(/(\d{1,3})/);
  if (!m) return 50;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

function parseList(body: string | undefined, max: number): string[] {
  if (!body) return [];
  return body
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*\d*\.?\s*/, "").replace(/^\s*\d+\.\s*/, "").trim())
    .map((l) => l.replace(/^["']|["']$/g, "").trim())
    .filter((l) => l.length >= 2 && l.length <= 400)
    .slice(0, max);
}

/**
 * Parse a single issue body. Issues are typically structured like:
 *
 *   **Excerpt:** "the text from the draft"
 *   **Why:** explanation
 *   **Fix:** suggested rewrite
 *
 * The heading itself often carries the severity and category, e.g.
 * `### high · dont_violation` or `### Issue 1 (medium, tone)`.
 */
function parseIssueFromHeading(
  heading: string,
  body: string,
): VoiceAuditIssue | null {
  // Try heading patterns in order:
  // - "high · dont_violation"
  // - "Issue 1 (medium, tone)"
  // - "[high] dont_violation"
  // - any pair of severity/category words
  let severity: AuditIssueSeverity | undefined;
  let category: AuditIssueCategory | undefined;

  const sevMatch = heading.match(
    /\b(high|medium|low|critical|major|minor|polish)\b/i,
  );
  if (sevMatch) severity = normalizeSeverity(sevMatch[1]);

  const catMatch = heading.match(
    /\b(tone|do[_\s-]violation|don'?t[_\s-]violation|forbidden[_\s-]?word|missing[_\s-]required|reading[_\s-]level|audience[_\s-]mismatch|other)\b/i,
  );
  if (catMatch) category = normalizeCategory(catMatch[1]);

  // Body fields — also support inline labels for severity/category if not in heading.
  const bodySev = pluckField(body, "Severity");
  const bodyCat = pluckField(body, "Category");
  if (!severity && bodySev) severity = normalizeSeverity(bodySev);
  if (!category && bodyCat) category = normalizeCategory(bodyCat);

  const excerpt =
    pluckField(body, "Excerpt") ??
    pluckField(body, "Quote") ??
    pluckField(body, "Text") ??
    "";
  const explanation =
    pluckField(body, "Why") ??
    pluckField(body, "Explanation") ??
    pluckField(body, "Reason") ??
    "";
  const suggestion =
    pluckField(body, "Fix") ??
    pluckField(body, "Suggestion") ??
    pluckField(body, "Rewrite") ??
    undefined;

  // An "issue" needs at least an excerpt or an explanation to be worth reporting.
  if (!excerpt.trim() && !explanation.trim()) return null;

  return {
    excerpt: excerpt.trim().slice(0, 400),
    category: category ?? "other",
    severity: severity ?? "medium",
    explanation: explanation.trim().slice(0, 400) || "(no explanation provided)",
    suggestion: suggestion?.trim().slice(0, 400) || undefined,
  };
}

export function parseVoiceAuditMarkdown(raw: string): VoiceAudit {
  const sections = splitSections(raw);

  const scoreSec = sections.find((s) => /^score|fidelity|overall/i.test(s.title));
  const summarySec = sections.find((s) => /^summary|overview|verdict/i.test(s.title));
  const strengthsSec = sections.find((s) => /^strength/i.test(s.title));
  const issuesSec = sections.find((s) => /^issue/i.test(s.title));

  // Strengths is straightforward.
  const strengths = parseList(strengthsSec?.body, 5);

  // Issues are sub-sections nested under "## Issues". Find any heading that
  // sits *after* the Issues heading and is a higher level than Issues.
  const issues: VoiceAuditIssue[] = [];
  if (issuesSec) {
    const idx = sections.indexOf(issuesSec);
    for (let i = idx + 1; i < sections.length; i++) {
      const s = sections[i];
      // Stop when we hit another section at the same level as Issues.
      if (s.level <= issuesSec.level) break;
      const parsed = parseIssueFromHeading(s.title, s.body);
      if (parsed) issues.push(parsed);
    }
  }

  // Sort by severity (high first).
  const sevRank: Record<AuditIssueSeverity, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  issues.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  const score = parseScore(scoreSec?.body);
  const summary = (summarySec?.body || "").trim().slice(0, 600);

  return {
    overall_score: score,
    summary:
      summary ||
      "Audit summary not extracted. The draft was scored from the model's overall response.",
    strengths,
    issues: issues.slice(0, 20),
  };
}
