/**
 * Reproduces the copywriter planner failure ("Invalid JSON response") and
 * verifies the new markdown parser handles it.
 *
 * Run: pnpm tsx scripts/test-planner-parser.ts
 */

import { parsePlannerMarkdown } from "../src/lib/agents/copywriter/planner-parser";

interface Fixture {
  label: string;
  raw: string;
  expectAngles: number;
  expectFirstLabelIncludes?: string;
  expectFirstHookIncludes?: string;
}

const FULL_GOOD = `## Insight
The brief is asking for activation copy aimed at PMs who already track activation metrics — generic
"unlock activation" hooks land flat. The angle has to either reframe the metric itself or call out a
specific moment of being stuck.

## Angle 1: Anti-jargon
**Strategy:** Refuse the vocabulary the audience is sick of. Replace "activation funnel" with the
concrete moment. Builds trust by sounding like an operator.
**Hook:** Stop guessing what's blocking activation.
**Must include:** support thread, North Star metric
**Avoid:** "delve", "tapestry", "leverage"

## Angle 2: Founder confession
**Strategy:** Lead with the team's own blind spot. Vulnerable and specific beats polished claims.
**Hook:** We were measuring activation wrong for two quarters.
**Must include:** —
**Avoid:** triplets

## Angle 3: Specific-number
**Strategy:** Anchor everything to one concrete number from the customer evidence. Numbers stick;
adjectives don't.
**Hook:** 73% of churn happens before the first North Star event.
**Must include:** 73%
**Avoid:** —`;

const FIXTURES: Fixture[] = [
  {
    label: "well-formed planner markdown",
    raw: FULL_GOOD,
    expectAngles: 3,
    expectFirstLabelIncludes: "Anti-jargon",
    expectFirstHookIncludes: "Stop guessing",
  },
  {
    label: "preamble prose before headings",
    raw:
      "Here are three angles for the brief, with a brief insight at the top.\n\n" +
      FULL_GOOD,
    expectAngles: 3,
    expectFirstLabelIncludes: "Anti-jargon",
  },
  {
    label: "wrapped in markdown code fence",
    raw: "```markdown\n" + FULL_GOOD + "\n```",
    expectAngles: 3,
    expectFirstHookIncludes: "Stop guessing",
  },
  {
    label: "h3 angles instead of h2",
    raw: FULL_GOOD.replace(/^## Angle/gm, "### Angle"),
    expectAngles: 3,
    expectFirstLabelIncludes: "Anti-jargon",
  },
  {
    label: "em-dash separator on angle title",
    raw: FULL_GOOD.replace(/Angle (\d+): /g, "Angle $1 — "),
    expectAngles: 3,
    expectFirstLabelIncludes: "Anti-jargon",
  },
  {
    label: "no field bolding (plain Strategy: foo)",
    raw: FULL_GOOD.replace(/\*\*(Strategy|Hook|Must include|Avoid):\*\*/g, "$1:"),
    expectAngles: 3,
    expectFirstLabelIncludes: "Anti-jargon",
    expectFirstHookIncludes: "Stop guessing",
  },
  {
    label: "model returned only one angle (was the user's bug — runs were lost)",
    raw: `## Insight
A single insight, no more.

## Angle 1: Solo
**Strategy:** Just one angle.
**Hook:** Try it.
**Must include:** —
**Avoid:** —`,
    expectAngles: 1,
    expectFirstLabelIncludes: "Solo",
  },
  {
    label: "model omitted Insight section entirely",
    raw: FULL_GOOD.replace(/## Insight\n[^#]+/, ""),
    expectAngles: 3,
    expectFirstLabelIncludes: "Anti-jargon",
  },
  {
    label: "model used 'Hook' instead of '**Hook:**' (no colon punctuation in title)",
    raw: FULL_GOOD.replace(/\*\*Hook:\*\*/g, "Hook:"),
    expectAngles: 3,
    expectFirstHookIncludes: "Stop guessing",
  },
  {
    label: "completely empty — should not throw",
    raw: "",
    expectAngles: 0,
  },
];

let passed = 0;
let failed = 0;
for (const f of FIXTURES) {
  let out: ReturnType<typeof parsePlannerMarkdown> | null = null;
  try {
    out = parsePlannerMarkdown(f.raw);
  } catch (e) {
    console.log(`[FAIL] ${f.label} — threw: ${(e as Error).message}`);
    failed++;
    continue;
  }
  const issues: string[] = [];
  if (out.angles.length !== f.expectAngles) {
    issues.push(`expected ${f.expectAngles} angles, got ${out.angles.length}`);
  }
  if (
    f.expectFirstLabelIncludes &&
    !out.angles[0]?.label.toLowerCase().includes(f.expectFirstLabelIncludes.toLowerCase())
  ) {
    issues.push(
      `first label "${out.angles[0]?.label}" missing "${f.expectFirstLabelIncludes}"`,
    );
  }
  if (
    f.expectFirstHookIncludes &&
    !out.angles[0]?.hook.toLowerCase().includes(f.expectFirstHookIncludes.toLowerCase())
  ) {
    issues.push(
      `first hook "${out.angles[0]?.hook}" missing "${f.expectFirstHookIncludes}"`,
    );
  }
  if (issues.length === 0) {
    console.log(`[OK]   ${f.label}`);
    passed++;
  } else {
    console.log(`[FAIL] ${f.label} — ${issues.join("; ")}`);
    failed++;
  }
}
console.log(`\n${passed}/${FIXTURES.length} passed.`);
process.exit(failed === 0 ? 0 : 1);
