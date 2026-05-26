/**
 * Verify the SEO auditor markdown parser handles the variations weak
 * models produce.
 *
 * Run: pnpm tsx scripts/test-seo-auditor-parser.ts
 */

import { parseSeoAuditMarkdown } from "../src/lib/agents/seo-auditor-parser";

interface Fixture {
  label: string;
  raw: string;
  expect: (out: ReturnType<typeof parseSeoAuditMarkdown>) => string | null;
}

const FULL_GOOD = `## Detected intent
commercial

## Suggestions

### 1. rewrite_paragraph
Excerpt: Buty są wygodne i tanie.
The opening paragraph is too thin and doesn't include the primary keyword. Rewrite it to lead with "wygodne buty damskie" and a concrete benefit (e.g., "all-day cushioning"). Top SERP pages open with the keyword in the first sentence.

### 2. add_heading
Excerpt:
Add an H2 about pricing. Five of the top ten SERP pages have a "Cena" section; without one this article looks incomplete relative to competitor coverage.

### 3. add_lsi_keyword
The doc misses semantically-related vocabulary that pages ranking for this query consistently include: "ortopedyczne", "skóra naturalna", "wkładka". Weave one or two into the existing paragraphs naturally.`;

const FIXTURES: Fixture[] = [
  {
    label: "well-formed audit markdown",
    raw: FULL_GOOD,
    expect: (out) => {
      if (out.detectedIntent !== "commercial")
        return `intent=${out.detectedIntent} expected commercial`;
      if (out.suggestions.length !== 3)
        return `${out.suggestions.length} suggestions, expected 3`;
      if (out.suggestions[0].type !== "rewrite_paragraph")
        return `s0.type=${out.suggestions[0].type}`;
      if (!out.suggestions[0].excerpt?.includes("Buty są wygodne"))
        return "excerpt missing on s0";
      if (out.suggestions[1].type !== "add_heading") return "s1.type wrong";
      if (out.suggestions[2].type !== "add_lsi_keyword") return "s2.type wrong";
      if (out.suggestions.every((s) => s.status === "pending") === false)
        return "status not pending";
      // No suggestion should carry a `proposed` field — that's Phase 2.
      if (out.suggestions.some((s) => "proposed" in s)) return "proposed field leaked";
      return null;
    },
  },
  {
    label: "no detected intent section",
    raw: FULL_GOOD.replace(/## Detected intent\ncommercial\n\n/, ""),
    expect: (out) => {
      if (out.detectedIntent !== undefined)
        return `expected undefined, got ${out.detectedIntent}`;
      if (out.suggestions.length !== 3) return "suggestions still parse";
      return null;
    },
  },
  {
    label: "intent on its own line, no decoration, extra prose",
    raw: FULL_GOOD.replace(
      "## Detected intent\ncommercial",
      "## Detected intent\nThe content is clearly INFORMATIONAL in nature.",
    ),
    expect: (out) =>
      out.detectedIntent === "informational"
        ? null
        : `intent=${out.detectedIntent}`,
  },
  {
    label: "suggestion types in human-friendly wording (rewrite paragraph etc.)",
    raw: `## Detected intent
informational

## Suggestions

### 1. Rewrite paragraph
Excerpt: Some bloated text here.
This sentence is too long and uses passive voice.

### 2. Tighten section
Excerpt: The pricing section
Cut 30% of the verbiage; the meaning will survive.

### 3. Add LSI keyword
Description: Weave in "ortopedyczne" and "wkładka" naturally.

### 4. Add new heading
Add a section about delivery options.`,
    expect: (out) => {
      if (out.suggestions.length !== 4)
        return `${out.suggestions.length} suggestions`;
      const types = out.suggestions.map((s) => s.type);
      if (types[0] !== "rewrite_paragraph") return "s0 type";
      if (types[1] !== "tighten_section") return "s1 type";
      if (types[2] !== "add_lsi_keyword") return "s2 type";
      if (types[3] !== "add_heading") return "s3 type";
      return null;
    },
  },
  {
    label: "code-fence wrapped",
    raw: "```markdown\n" + FULL_GOOD + "\n```",
    expect: (out) =>
      out.suggestions.length === 3 && out.detectedIntent === "commercial"
        ? null
        : "lost in fence",
  },
  {
    label: "suggestion missing type → dropped, not thrown",
    raw: `## Detected intent
informational

## Suggestions

### 1. (no recognisable type)
Excerpt: foo
Some description that doesn't match a known suggestion type.

### 2. add_heading
Add an H2 about pricing.`,
    expect: (out) => {
      if (out.suggestions.length !== 1)
        return `expected 1 (s1 dropped), got ${out.suggestions.length}`;
      if (out.suggestions[0].type !== "add_heading") return "wrong remaining";
      return null;
    },
  },
  {
    label: "suggestion missing description → dropped",
    raw: `## Detected intent
informational

## Suggestions

### 1. rewrite_paragraph
Excerpt: foo

### 2. add_heading
Add an H2 about pricing.`,
    expect: (out) => {
      if (out.suggestions.length !== 1)
        return `expected 1, got ${out.suggestions.length}`;
      if (out.suggestions[0].type !== "add_heading") return "wrong remaining";
      return null;
    },
  },
  {
    label: "completely empty input — should not throw",
    raw: "",
    expect: (out) => {
      if (out.detectedIntent !== undefined) return "intent leaked";
      if (!Array.isArray(out.suggestions)) return "suggestions not array";
      if (out.suggestions.length !== 0) return "suggestions not empty";
      return null;
    },
  },
  {
    label: "suggestions cap at 12",
    raw:
      "## Detected intent\ninformational\n\n## Suggestions\n\n" +
      Array.from({ length: 20 }, (_, i) => `### ${i + 1}. rewrite_paragraph
Excerpt: piece ${i + 1}
Description ${i + 1}.`).join("\n\n"),
    expect: (out) => {
      if (out.suggestions.length !== 12)
        return `expected 12 cap, got ${out.suggestions.length}`;
      return null;
    },
  },
  {
    label: "extra prose before/after sections doesn't break the parser",
    raw: `Here is my analysis of the document.

## Detected intent
commercial

I'll now provide suggestions.

## Suggestions

### 1. rewrite_paragraph
Excerpt: Buty są wygodne i tanie.
Rewrite to add the keyword.

That's all from me. Thanks for reading.`,
    expect: (out) => {
      if (out.detectedIntent !== "commercial") return "intent lost";
      if (out.suggestions.length !== 1) return "suggestion lost";
      return null;
    },
  },
  {
    label: "no Suggestions section",
    raw: `## Detected intent
informational

(The document looks great. No suggestions.)`,
    expect: (out) => {
      if (out.detectedIntent !== "informational") return "intent lost";
      if (out.suggestions.length !== 0) return "phantom suggestions";
      return null;
    },
  },
];

let passed = 0;
let failed = 0;
for (const f of FIXTURES) {
  let out: ReturnType<typeof parseSeoAuditMarkdown> | null = null;
  try {
    out = parseSeoAuditMarkdown(f.raw);
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
