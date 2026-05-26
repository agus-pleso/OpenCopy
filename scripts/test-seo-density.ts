/**
 * Pure-function tests for the keyword density scorer.
 *
 * Run: pnpm tsx scripts/test-seo-density.ts
 */

import {
  countPhraseOccurrences,
  countWords,
  scoreDensity,
} from "../src/lib/seo/scorers/density";

interface Fixture {
  label: string;
  run: () => string | null;
}

const FIXTURES: Fixture[] = [
  {
    label: "countWords: latin",
    run: () => {
      const n = countWords("Hi how are you doing today");
      return n === 6 ? null : `expected 6, got ${n}`;
    },
  },
  {
    label: "countWords: polish diacritics",
    run: () => {
      const n = countWords("Cześć, jak się masz dziś?");
      return n === 5 ? null : `expected 5, got ${n}`;
    },
  },
  {
    label: "countWords: cyrillic",
    run: () => {
      const n = countWords("Як справи моя люба?");
      return n === 4 ? null : `expected 4, got ${n}`;
    },
  },
  {
    label: "countPhraseOccurrences: case-insensitive single word",
    run: () => {
      const n = countPhraseOccurrences("Buy the best shoes for buy", "buy");
      return n === 2 ? null : `expected 2, got ${n}`;
    },
  },
  {
    label: "countPhraseOccurrences: multi-word phrase, word-boundary",
    run: () => {
      const n = countPhraseOccurrences(
        "wygodne buty damskie są wygodne i tanie. wygodne buty damskie znowu.",
        "wygodne buty damskie",
      );
      return n === 2 ? null : `expected 2, got ${n}`;
    },
  },
  {
    label: "countPhraseOccurrences: substring NOT counted",
    run: () => {
      // "but" should not match inside "buttercup" or "abut".
      const n = countPhraseOccurrences(
        "buttercup abuts the abutment but no",
        "but",
      );
      return n === 1 ? null : `expected 1 (only the standalone 'but'), got ${n}`;
    },
  },
  {
    label: "score: zero occurrences → 0",
    run: () => {
      const r = scoreDensity({
        text: "Lorem ipsum dolor sit amet ".repeat(50),
        primaryKeyword: "wygodne buty",
        locale: "pl",
      });
      return r.score === 0 ? null : `expected 0, got ${r.score}`;
    },
  },
  {
    label: "score: sweet spot in en window → high",
    run: () => {
      // 200 words, "shoes" appears 3x → 1.5% density (inside the en 1-2.5% window).
      const text =
        (("lorem ipsum dolor sit amet " as string).repeat(40) +
          "shoes ".repeat(3));
      const r = scoreDensity({
        text,
        primaryKeyword: "shoes",
        locale: "en",
      });
      if (r.score < 80)
        return `expected high score (in-window), got ${r.score}`;
      const d = r.details as { ratio: number };
      if (d.ratio < 0.013 || d.ratio > 0.017)
        return `ratio out of expected: ${d.ratio}`;
      return null;
    },
  },
  {
    label: "score: keyword stuffing → low score",
    run: () => {
      // 50 words, "shoes" 30x → 60% density (way over).
      const text = "shoes ".repeat(30) + "filler word ".repeat(10);
      const r = scoreDensity({
        text,
        primaryKeyword: "shoes",
        locale: "en",
      });
      if (r.score > 30)
        return `expected low score (stuffed), got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: well below the window → low score",
    run: () => {
      // Long doc, single hit → way under window.
      const text = "filler ".repeat(2000) + "shoes";
      const r = scoreDensity({
        text,
        primaryKeyword: "shoes",
        locale: "en",
      });
      if (r.score > 20) return `expected very low score, got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: empty doc → 0",
    run: () => {
      const r = scoreDensity({
        text: "",
        primaryKeyword: "anything",
        locale: "en",
      });
      return r.score === 0 ? null : `expected 0, got ${r.score}`;
    },
  },
  {
    label: "score: ukraine cyrillic + secondaries lands in window",
    run: () => {
      // ~90-word text with 2 "купити" + 1 "ціна" → 3/90 = 3.3% density,
      // just above the uk 1.2–2.8% window. Below the 2×-max floor so
      // should grade mediocre (not zero, not high).
      const filler = "слово ".repeat(85);
      const text = `${filler} купити купити ціна`;
      const r = scoreDensity({
        text,
        primaryKeyword: "купити",
        secondaryKeywords: ["ціна"],
        locale: "uk",
      });
      const d = r.details as { count: number; primaryCount: number };
      if (d.primaryCount !== 2) return `primary count: ${d.primaryCount}`;
      if (d.count !== 3) return `total count: ${d.count}`;
      if (r.score === 0) return "should not be zero when keywords are present";
      if (r.score >= 90) return "should not be top-mark (above window)";
      return null;
    },
  },
  {
    label: "score: deep keyword stuffing on cyrillic floors near 0",
    run: () => {
      // 30 words with 10 "купити" hits — 33% density, well above the
      // 2x-upper-bound cutoff for the uk locale.
      const text = "купити ".repeat(10) + "слово ".repeat(20);
      const r = scoreDensity({
        text,
        primaryKeyword: "купити",
        locale: "uk",
      });
      if (r.score > 10) return `expected very low, got ${r.score}`;
      return null;
    },
  },
  {
    label: "score: details shape matches schema expectations",
    run: () => {
      const r = scoreDensity({
        text: "shoes shoes shoes ".repeat(20) + "filler word ".repeat(40),
        primaryKeyword: "shoes",
        locale: "en",
      });
      const d = r.details as {
        totalWords: number;
        count: number;
        primaryCount: number;
        secondaryCount: number;
        ratio: number;
        target: { min: number; max: number };
      };
      if (typeof d.totalWords !== "number") return "totalWords missing";
      if (typeof d.count !== "number") return "count missing";
      if (typeof d.ratio !== "number") return "ratio missing";
      if (!d.target || typeof d.target.min !== "number") return "target missing";
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
