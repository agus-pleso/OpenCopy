/**
 * Reproduces the drafter failure ("content: Required") and verifies the new
 * text-with-separator parser handles common model misbehaviors.
 *
 * Run: pnpm tsx scripts/test-drafter-parser.ts
 */

import { parseDrafterOutput } from "../src/lib/agents/copywriter/drafter-parser";

interface Fixture {
  label: string;
  raw: string;
  expectContentIncludes?: string;
  expectRationaleIncludes?: string;
}

const FIXTURES: Fixture[] = [
  {
    label: "well-formed copy + separator + rationale",
    raw: `Stop guessing what's blocking activation.

Try Honeycomb free for 14 days.
---
Lead reframes "metric" as "support thread" — the brand's signature move.`,
    expectContentIncludes: "Stop guessing",
    expectRationaleIncludes: "support thread",
  },
  {
    label: "no separator at all (was the user's bug — content lost entirely)",
    raw: `Stop guessing what's blocking activation.

Try Honeycomb free for 14 days.`,
    expectContentIncludes: "Stop guessing",
    // The fallback rationale should be the stock note.
    expectRationaleIncludes: "not provided",
  },
  {
    label: "wrapped in markdown code fence",
    raw: "```\n" + `Stop guessing what's blocking activation.
---
Lead reframes "metric" as "support thread".` + "\n```",
    expectContentIncludes: "Stop guessing",
    expectRationaleIncludes: "support thread",
  },
  {
    label: "long separator (5 dashes) instead of 3",
    raw: `Stop guessing what's blocking activation.
-----
Lead reframes "metric" as "support thread".`,
    expectContentIncludes: "Stop guessing",
    expectRationaleIncludes: "support thread",
  },
  {
    label: "separator with surrounding whitespace",
    raw: `Stop guessing what's blocking activation.
   ---
Lead reframes "metric" as "support thread".`,
    expectContentIncludes: "Stop guessing",
    expectRationaleIncludes: "support thread",
  },
];

let passed = 0;
let failed = 0;
for (const f of FIXTURES) {
  const out = parseDrafterOutput(f.raw);
  const issues: string[] = [];
  if (
    f.expectContentIncludes &&
    !out.content.toLowerCase().includes(f.expectContentIncludes.toLowerCase())
  ) {
    issues.push(`content missing "${f.expectContentIncludes}"`);
  }
  if (
    f.expectRationaleIncludes &&
    !out.rationale.toLowerCase().includes(f.expectRationaleIncludes.toLowerCase())
  ) {
    issues.push(`rationale missing "${f.expectRationaleIncludes}"`);
  }
  if (out.content.length === 0) issues.push("empty content (drafter bug)");
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
