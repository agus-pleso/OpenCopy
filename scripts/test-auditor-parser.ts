/**
 * Verifies the voice auditor markdown parser handles the variations weak
 * models produce.
 *
 * Run: pnpm tsx scripts/test-auditor-parser.ts
 */

import { parseVoiceAuditMarkdown } from "../src/lib/agents/voice-audit-parser";

interface Fixture {
  label: string;
  raw: string;
  /** Predicate: returns null on success or a reason on failure. */
  expect: (out: ReturnType<typeof parseVoiceAuditMarkdown>) => string | null;
}

const FULL_GOOD = `## Score
72

## Summary
The draft is mostly on-brand: confident voice, concrete numbers. Two issues hold it back from a
shippable score — the lead leans on "delve" and the closer stacks three adjectives.

## Strengths
- Lead with the support thread reframes activation in the brand's signature move
- "73% of churn" matches the voice card's preference for hard numbers

## Issues

### high · forbidden_word
**Excerpt:** "delve into the activation funnel"
**Why:** "delve" is on the brand's forbidden words list — flagged as an AI tell in the voice card.
**Fix:** "trace the activation funnel"

### medium · tone
**Excerpt:** "fast, efficient, intuitive"
**Why:** Triplets without warrant violate the voice card's "no unmotivated triplets" rule.
**Fix:** "fast and intuitive"`;

const FIXTURES: Fixture[] = [
  {
    label: "well-formed audit markdown",
    raw: FULL_GOOD,
    expect: (out) => {
      if (out.overall_score !== 72) return `score=${out.overall_score} expected 72`;
      if (out.issues.length !== 2) return `${out.issues.length} issues, expected 2`;
      if (out.issues[0].severity !== "high") return "first issue not high severity";
      if (out.issues[0].category !== "forbidden_word") return "first category wrong";
      if (!out.issues[0].excerpt.includes("delve")) return "excerpt missing";
      if (out.strengths.length !== 2) return "strengths count wrong";
      return null;
    },
  },
  {
    label: "score on its own line, no decoration",
    raw: FULL_GOOD.replace(/## Score\n72/, "## Score\nThe overall score is 78."),
    expect: (out) => (out.overall_score === 78 ? null : `score=${out.overall_score}`),
  },
  {
    label: "alternate severity wording (critical / minor)",
    raw: FULL_GOOD.replace("high · forbidden_word", "critical, forbidden_word").replace(
      "medium · tone",
      "minor — tone",
    ),
    expect: (out) => {
      if (out.issues[0].severity !== "high") return "critical not normalised";
      if (out.issues[1].severity !== "low") return "minor not normalised";
      return null;
    },
  },
  {
    label: "category as 'don't violation' instead of dont_violation",
    raw: FULL_GOOD.replace("forbidden_word", "don't violation"),
    expect: (out) =>
      out.issues[0].category === "dont_violation" ? null : "category not normalised",
  },
  {
    label: "no Issues section at all (clean draft)",
    raw: `## Score
95

## Summary
The draft ships unchanged.

## Strengths
- On-brand throughout`,
    expect: (out) => {
      if (out.overall_score !== 95) return `score=${out.overall_score}`;
      if (out.issues.length !== 0) return `expected 0 issues, got ${out.issues.length}`;
      return null;
    },
  },
  {
    label: "model omitted Score section",
    raw: FULL_GOOD.replace(/## Score\n72\n\n/, ""),
    expect: (out) => {
      // Should fall back to a reasonable default rather than throw.
      if (typeof out.overall_score !== "number") return "score not a number";
      return null;
    },
  },
  {
    label: "wrapped in code fence",
    raw: "```markdown\n" + FULL_GOOD + "\n```",
    expect: (out) =>
      out.overall_score === 72 && out.issues.length === 2 ? null : "lost in fence",
  },
  {
    label: "issues use ### Issue 1 / Issue 2 with metadata in body",
    raw: `## Score
60

## Summary
Several voice issues.

## Strengths

## Issues

### Issue 1
**Severity:** high
**Category:** forbidden_word
**Excerpt:** "delve into"
**Why:** Forbidden word.
**Fix:** "trace"

### Issue 2
**Severity:** medium
**Category:** tone
**Excerpt:** "fast, efficient, intuitive"
**Why:** Unmotivated triplet.
**Fix:** "fast and intuitive"`,
    expect: (out) => {
      if (out.issues.length !== 2) return `${out.issues.length} issues`;
      if (out.issues[0].severity !== "high") return "issue 1 not high";
      if (out.issues[0].category !== "forbidden_word") return "issue 1 category";
      return null;
    },
  },
  {
    label: "completely empty response — should not throw",
    raw: "",
    expect: (out) => {
      if (typeof out.overall_score !== "number") return "score not a number";
      if (!Array.isArray(out.issues)) return "issues not array";
      return null;
    },
  },
];

let passed = 0;
let failed = 0;
for (const f of FIXTURES) {
  let out: ReturnType<typeof parseVoiceAuditMarkdown> | null = null;
  try {
    out = parseVoiceAuditMarkdown(f.raw);
  } catch (e) {
    console.log(`[FAIL] ${f.label} — threw: ${(e as Error).message}`);
    failed++;
    continue;
  }
  const reason = f.expect(out);
  if (reason) {
    console.log(`[FAIL] ${f.label} — ${reason}`);
    failed++;
  } else {
    console.log(`[OK]   ${f.label}`);
    passed++;
  }
}
console.log(`\n${passed}/${FIXTURES.length} passed.`);
process.exit(failed === 0 ? 0 : 1);
