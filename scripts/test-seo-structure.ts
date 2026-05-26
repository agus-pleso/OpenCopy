/**
 * Smoke test the heading hierarchy scorer.
 *
 * Run: pnpm tsx scripts/test-seo-structure.ts
 */

import {
  extractHeadings,
  scoreStructure,
} from "../src/lib/seo/scorers/structure";

interface Fixture {
  label: string;
  run: () => string | null;
}

const FIXTURES: Fixture[] = [
  {
    label: "extractHeadings: tiptap-style h1",
    run: () => {
      const h1s = extractHeadings(
        '<h1 class="tt-h1">Wygodne buty damskie</h1>',
        "h1",
      );
      return h1s[0] === "Wygodne buty damskie"
        ? null
        : `got "${h1s[0]}"`;
    },
  },
  {
    label: "extractHeadings: strips inner inline tags + decodes entities",
    run: () => {
      const h2s = extractHeadings(
        '<h2><strong>Cena</strong> &amp; warianty</h2>',
        "h2",
      );
      return h2s[0] === "Cena & warianty" ? null : `got "${h2s[0]}"`;
    },
  },
  {
    label: "extractHeadings: empty html returns []",
    run: () => {
      const h1s = extractHeadings("", "h1");
      return h1s.length === 0 ? null : "expected empty";
    },
  },
  {
    label: "extractHeadings: multiple h2s in order",
    run: () => {
      const h2s = extractHeadings(
        "<h2>One</h2><p>x</p><h2>Two</h2><h2>Three</h2>",
        "h2",
      );
      return h2s.length === 3 && h2s[0] === "One" && h2s[2] === "Three"
        ? null
        : `got ${JSON.stringify(h2s)}`;
    },
  },
  {
    label: "score: perfect outline (1 h1, 3 h2, 2 h3) → high",
    run: () => {
      const html =
        "<h1>Title</h1>" +
        "<h2>Section 1</h2><h2>Section 2</h2><h2>Section 3</h2>" +
        "<h3>Sub 1</h3><h3>Sub 2</h3>";
      const r = scoreStructure({ html });
      if (r.score < 90)
        return `expected ≥90 for ideal outline, got ${r.score}`;
      const d = r.details as { h1: number; h2: number; h3: number };
      if (d.h1 !== 1 || d.h2 !== 3 || d.h3 !== 2) {
        return `counts: ${JSON.stringify(d)}`;
      }
      return null;
    },
  },
  {
    label: "score: no h1 → significantly lower",
    run: () => {
      const r = scoreStructure({
        html: "<p>Plain text</p><h2>Section</h2><h2>Section 2</h2>",
      });
      if (r.score > 50)
        return `expected ≤50 with no h1, got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: multiple h1s → middling",
    run: () => {
      const html =
        "<h1>One</h1><h1>Two</h1><h2>A</h2><h2>B</h2>";
      const r = scoreStructure({ html });
      // Score = 20 (multiple h1) + 30 (2 h2) + 12 (no h3) = 62 — middling.
      if (r.score < 40 || r.score > 75)
        return `expected 40-75 for multi-h1, got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: empty html → score 12 (no headings, no penalty)",
    run: () => {
      const r = scoreStructure({ html: "" });
      const d = r.details as { h1: number; h2: number; h3: number };
      if (d.h1 !== 0 || d.h2 !== 0 || d.h3 !== 0) return "expected zero counts";
      // h1=0 → 0, h2=0 → 0, h3=0 → 12 (not penalised) ⇒ 12.
      if (r.score !== 12) return `expected 12, got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: details carry headingTexts for downstream consumers",
    run: () => {
      const r = scoreStructure({
        html: "<h1>Title</h1><h2>One</h2><h2>Two</h2>",
      });
      const d = r.details as {
        headingTexts: { h1: string[]; h2: string[]; h3: string[] };
      };
      if (!d.headingTexts) return "headingTexts missing";
      if (d.headingTexts.h1[0] !== "Title") return "h1 text lost";
      if (d.headingTexts.h2.length !== 2) return "h2 count lost";
      return null;
    },
  },
];

let passed = 0;
let failed = 0;
for (const f of FIXTURES) {
  let reason: string | null;
  try {
    reason = f.run();
  } catch (e) {
    reason = `threw: ${(e as Error).message}`;
  }
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
