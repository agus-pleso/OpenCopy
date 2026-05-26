/**
 * Smoke test the per-locale readability scorers.
 *
 * Run: pnpm tsx scripts/test-seo-readability.ts
 */

import {
  countSyllables,
  scoreReadability,
  splitSentences,
  tokenizeWords,
} from "../src/lib/seo/scorers/readability";

interface Fixture {
  label: string;
  run: () => string | null;
}

const FIXTURES: Fixture[] = [
  {
    label: "splitSentences: classic punctuation",
    run: () => {
      const s = splitSentences("Hi! How are you? I am well.");
      return s.length === 3
        ? null
        : `expected 3 sentences, got ${s.length}: ${JSON.stringify(s)}`;
    },
  },
  {
    label: "tokenizeWords: mixed cyrillic + latin",
    run: () => {
      const w = tokenizeWords("Hi Як ти? Test 123.");
      // Hi / Як / ти / Test / 123
      return w.length === 5 ? null : `expected 5, got ${w.length}`;
    },
  },
  {
    label: "countSyllables: simple english",
    run: () => {
      const cat = countSyllables("cat");
      const banana = countSyllables("banana");
      if (cat !== 1) return `'cat' expected 1, got ${cat}`;
      if (banana !== 3) return `'banana' expected 3, got ${banana}`;
      return null;
    },
  },
  {
    label: "countSyllables: silent trailing e",
    run: () => {
      const hide = countSyllables("hide");
      const make = countSyllables("make");
      if (hide !== 1) return `'hide' expected 1, got ${hide}`;
      if (make !== 1) return `'make' expected 1, got ${make}`;
      return null;
    },
  },
  {
    label: "en: Flesch — simple text scores higher than complex",
    run: () => {
      const simple = scoreReadability({
        text: "Hi how are you. I am well. The day is nice.",
        locale: "en",
      });
      const complex = scoreReadability({
        text:
          "Notwithstanding the aforementioned anthropomorphic conceptualization, " +
          "the multifaceted juxtaposition of phenomenological perspectives precludes deterministic resolution.",
        locale: "en",
      });
      if (simple.score <= complex.score)
        return `simple ${simple.score} should beat complex ${complex.score}`;
      const d = simple.details as { formula: string };
      if (d.formula !== "flesch") return `expected flesch, got ${d.formula}`;
      return null;
    },
  },
  {
    label: "pl: Pisarek — short polish text reads easier than dense one",
    run: () => {
      const easy = scoreReadability({
        text: "Cześć. Jak się masz. Mam się dobrze. Dzień jest piękny.",
        locale: "pl",
      });
      const hard = scoreReadability({
        text:
          "Niewystarczająca konceptualizacja antropologicznej fenomenologii " +
          "uniemożliwia deterministyczną reorientację multidyscyplinarnych perspektyw badawczych w sferze socjolingwistyki.",
        locale: "pl",
      });
      if (easy.score <= hard.score)
        return `easy ${easy.score} should beat hard ${hard.score}`;
      const d = easy.details as { formula: string };
      if (d.formula !== "pisarek") return `expected pisarek, got ${d.formula}`;
      return null;
    },
  },
  {
    label: "polish reading is different from english (locale dispatch)",
    run: () => {
      const text = "Cześć, jak się masz?";
      const enResult = scoreReadability({ text: "Hi how are you", locale: "en" });
      const plResult = scoreReadability({ text, locale: "pl" });
      const enD = enResult.details as { formula: string };
      const plD = plResult.details as { formula: string };
      if (enD.formula !== "flesch") return "en should use flesch";
      if (plD.formula !== "pisarek") return "pl should use pisarek";
      return null;
    },
  },
  {
    label: "ro: returns a value with the ro-simplified formula",
    run: () => {
      const text =
        "Bună dimineața. Cum ești? Eu sunt bine, mulțumesc. Ziua este frumoasă.";
      const r = scoreReadability({ text, locale: "ro" });
      const d = r.details as { formula: string };
      if (d.formula !== "ro-simplified") return `formula=${d.formula}`;
      if (r.score < 0 || r.score > 100) return `score out of bounds: ${r.score}`;
      return null;
    },
  },
  {
    label: "uk: returns a value with the uk-simplified formula",
    run: () => {
      const text =
        "Привіт. Як справи? У мене все добре, дякую. Сьогодні гарний день.";
      const r = scoreReadability({ text, locale: "uk" });
      const d = r.details as { formula: string };
      if (d.formula !== "uk-simplified") return `formula=${d.formula}`;
      if (r.score < 0 || r.score > 100) return `score out of bounds: ${r.score}`;
      return null;
    },
  },
  {
    label: "empty text doesn't throw",
    run: () => {
      for (const locale of ["en", "pl", "ro", "uk"] as const) {
        const r = scoreReadability({ text: "", locale });
        if (typeof r.score !== "number") return `${locale}: score not number`;
      }
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
