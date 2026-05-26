/**
 * Smoke test the length scorer (piecewise word-count against locale
 * target band).
 *
 * Run: pnpm tsx scripts/test-seo-length.ts
 */

import { resolveLengthTarget, scoreLength } from "../src/lib/seo/scorers/length";

interface Fixture {
  label: string;
  run: () => string | null;
}

function repeat(word: string, n: number): string {
  return Array.from({ length: n }, () => word).join(" ");
}

const FIXTURES: Fixture[] = [
  {
    label: "resolveLengthTarget: known channel",
    run: () => {
      const { target, resolved } = resolveLengthTarget("en", "ig-post");
      if (resolved !== "ig-post") return `resolved=${resolved}`;
      if (target.ideal !== 80) return `ig-post ideal: ${target.ideal}`;
      return null;
    },
  },
  {
    label: "resolveLengthTarget: unknown channel falls back to blog",
    run: () => {
      const { target, resolved } = resolveLengthTarget("en", "wildly-unknown");
      if (resolved !== "blog") return `resolved=${resolved}`;
      if (target.ideal !== 1100) return `blog ideal en: ${target.ideal}`;
      return null;
    },
  },
  {
    label: "resolveLengthTarget: pl blog is longer than en blog",
    run: () => {
      const en = resolveLengthTarget("en", "blog").target;
      const pl = resolveLengthTarget("pl", "blog").target;
      if (pl.ideal <= en.ideal)
        return `pl blog ${pl.ideal} should beat en blog ${en.ideal}`;
      return null;
    },
  },
  {
    label: "score: ideal-length blog → 100",
    run: () => {
      const r = scoreLength({
        text: repeat("word", 1100),
        contentType: "blog",
        locale: "en",
      });
      if (r.score !== 100)
        return `expected 100 at ideal, got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: too short → low",
    run: () => {
      const r = scoreLength({
        text: repeat("word", 20),
        contentType: "blog",
        locale: "en",
      });
      // 20 words vs blog target.min=600 → 20/600 * 80 ≈ 2.67 → 3
      if (r.score > 15) return `expected low score, got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: at min → 80",
    run: () => {
      const r = scoreLength({
        text: repeat("word", 600),
        contentType: "blog",
        locale: "en",
      });
      if (r.score < 75 || r.score > 85)
        return `expected ~80 at min, got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: at max → 80",
    run: () => {
      const r = scoreLength({
        text: repeat("word", 2000),
        contentType: "blog",
        locale: "en",
      });
      if (r.score < 75 || r.score > 85)
        return `expected ~80 at max, got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: way too long → low",
    run: () => {
      const r = scoreLength({
        text: repeat("word", 4500),
        contentType: "blog",
        locale: "en",
      });
      if (r.score > 5)
        return `expected near-zero (2.25x max), got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: ig-post short copy hits its own sweet spot",
    run: () => {
      const r = scoreLength({
        text: repeat("word", 80),
        contentType: "ig-post",
        locale: "en",
      });
      if (r.score !== 100)
        return `expected 100 at ig-post ideal, got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: empty text → 0",
    run: () => {
      const r = scoreLength({
        text: "",
        contentType: "blog",
        locale: "en",
      });
      return r.score === 0 ? null : `expected 0, got ${r.score}`;
    },
  },
  {
    label: "score: override target wins over locale default",
    run: () => {
      const r = scoreLength({
        text: repeat("word", 50),
        locale: "en",
        target: { min: 30, ideal: 50, max: 80 },
      });
      if (r.score !== 100)
        return `expected 100 with custom target, got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: details carry target + content type",
    run: () => {
      const r = scoreLength({
        text: repeat("word", 100),
        contentType: "blog",
        locale: "pl",
      });
      const d = r.details as {
        words: number;
        target: { min: number; ideal: number; max: number };
        contentType: string;
      };
      if (d.words !== 100) return `words=${d.words}`;
      if (d.contentType !== "blog") return `contentType=${d.contentType}`;
      if (typeof d.target.ideal !== "number") return "target missing";
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
