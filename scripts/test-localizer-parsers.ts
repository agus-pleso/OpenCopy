/**
 * Reproduces the localizer "Invalid JSON response" failure mode and verifies
 * each of its three sub-agent parsers handles realistic model output.
 *
 * Run: pnpm tsx scripts/test-localizer-parsers.ts
 */

import { parseCulturalAdapterMarkdown } from "../src/lib/agents/localizer/cultural-adapter-parser";
import { parseLocalizerMarkdown } from "../src/lib/agents/localizer/transcreator-parser";
import { parseBackTranslatorMarkdown } from "../src/lib/agents/localizer/back-translator-parser";

let totalPassed = 0;
let totalFailed = 0;

function group<T>(
  label: string,
  fixtures: Array<{ name: string; raw: string; expect: (out: T) => string | null }>,
  parser: (raw: string) => T,
) {
  console.log(`\n=== ${label} ===`);
  for (const f of fixtures) {
    let out: T | null = null;
    try {
      out = parser(f.raw);
    } catch (e) {
      console.log(`[FAIL] ${f.name} — threw: ${(e as Error).message}`);
      totalFailed++;
      continue;
    }
    const reason = f.expect(out);
    if (reason) {
      console.log(`[FAIL] ${f.name} — ${reason}`);
      totalFailed++;
    } else {
      console.log(`[OK]   ${f.name}`);
      totalPassed++;
    }
  }
}

/* ============================== cultural adapter ============================== */

const ADAPTER_GOOD = `## Formality
For B2B SaaS aimed at senior PMs in Poland, default to formal Pan/Pani throughout. Don't slip into
ty even in mid-sentence asides — the audience reads informal copy as marketing-y, not friendly.

## Length expectation
Polish runs 15–25% longer than English in B2B contexts. Plan for the lead to expand in particular.

## Notes

### high · idiom
**Excerpt:** "moving the needle"
**Guidance:** No direct PL idiom — use "przesuwa wskaźniki" (moves the metrics) or rephrase to
"daje konkretny efekt" (delivers a concrete effect). Avoid literal "rusza igłę".

### medium · formality
**Excerpt:** "you guys"
**Guidance:** "you guys" is impossible to render in formal PL. Switch to "Państwa zespół" (your
team, formal plural).`;

group("cultural adapter", [
  {
    name: "well-formed adapter markdown",
    raw: ADAPTER_GOOD,
    expect: (out) => {
      if (out.notes.length !== 2) return `${out.notes.length} notes, expected 2`;
      if (out.notes[0].risk !== "high") return "first note risk wrong";
      if (out.notes[0].category !== "idiom") return "first note category wrong";
      if (!out.notes[0].excerpt.includes("moving the needle")) return "excerpt lost";
      if (!/Pan\/Pani/.test(out.formality_recommendation)) return "formality lost";
      return null;
    },
  },
  {
    name: "no notes (clean translation)",
    raw: `## Formality
Default informal ty for D2C consumer copy.

## Length expectation
Roughly equivalent length.

## Notes
`,
    expect: (out) => (out.notes.length === 0 ? null : "should have 0 notes"),
  },
  {
    name: "alternate severity wording (critical / minor)",
    raw: ADAPTER_GOOD.replace("high · idiom", "critical, idiom").replace(
      "medium · formality",
      "minor — formality",
    ),
    expect: (out) => {
      if (out.notes[0].risk !== "high") return "critical not normalized";
      if (out.notes[1].risk !== "low") return "minor not normalized";
      return null;
    },
  },
  {
    name: "category as 'cultural reference' (with space)",
    raw: ADAPTER_GOOD.replace("idiom", "cultural reference"),
    expect: (out) =>
      out.notes[0].category === "cultural_reference"
        ? null
        : `got ${out.notes[0].category}`,
  },
  {
    name: "completely empty — should not throw",
    raw: "",
    expect: (out) => {
      if (!out.formality_recommendation) return "no formality fallback";
      if (!Array.isArray(out.notes)) return "notes not array";
      return null;
    },
  },
], parseCulturalAdapterMarkdown);

/* ================================ transcreator ================================ */

const TARGET_BODY = `Przestań zgadywać, co blokuje aktywację.

Najczystszy sygnał nie tkwi w liczbach — tkwi w wątku wsparcia, który właśnie zignorowałeś.

Wypróbuj Honeycomb przez 14 dni za darmo.`;

const TRANSCREATOR_GOOD = `## Target text
${TARGET_BODY}

## Decisions

### Decision 1
**Source:** "Stop guessing what's blocking activation"
**Target:** "Przestań zgadywać, co blokuje aktywację"
**Why:** Direct PL imperative; "zgadywać" carries the same impatience as "guessing". Kept the
brand's directness rather than softening to "Zastanów się".

### Decision 2
**Source:** "support thread you've been ignoring"
**Target:** "wątku wsparcia, który właśnie zignorowałeś"
**Why:** PL allows a tighter relative-clause construction here. "Właśnie zignorowałeś" (just
ignored) is sharper than the literal "który ignorowałeś" (had been ignoring).`;

group("transcreator", [
  {
    name: "well-formed transcreator markdown",
    raw: TRANSCREATOR_GOOD,
    expect: (out) => {
      if (!out.target_text.includes("Przestań zgadywać")) return "target text lost";
      if (out.decisions.length !== 2) return `${out.decisions.length} decisions`;
      if (!out.decisions[0].rationale.toLowerCase().includes("imperative")) {
        return "decision rationale lost";
      }
      return null;
    },
  },
  {
    name: "no Decisions section (clean transcreation)",
    raw: `## Target text
${TARGET_BODY}`,
    expect: (out) =>
      out.target_text.includes("Przestań") && out.decisions.length === 0
        ? null
        : "missing target or extra decisions",
  },
  {
    name: "no headings — entire response is the target (was the bug)",
    raw: TARGET_BODY,
    expect: (out) =>
      out.target_text.includes("Przestań zgadywać")
        ? null
        : "lost target text when headings missing",
  },
  {
    name: "wrapped in code fence",
    raw: "```markdown\n" + TRANSCREATOR_GOOD + "\n```",
    expect: (out) =>
      out.target_text.includes("Przestań") && out.decisions.length === 2
        ? null
        : "lost in fence",
  },
  {
    name: "completely empty — should not throw",
    raw: "",
    expect: (out) => (Array.isArray(out.decisions) ? null : "decisions not array"),
  },
], parseLocalizerMarkdown);

/* ============================== back translator ============================== */

const BACK_GOOD = `## Back-translation
Stop guessing what's blocking your activation.

The clearest signal isn't in numbers — it's in the support thread you just ignored.

Try Honeycomb for 14 days, free.

## Divergences

### transcreation_intent
**Target:** "wątku wsparcia, który właśnie zignorowałeś"
**Back-translated:** "support thread you just ignored"
**Note:** Source said "have been ignoring" (continuous); PL "właśnie zignorowałeś" reads as
"just ignored" — sharper, closer to the brand voice.

### lengthening_or_compression
**Target:** "Wypróbuj Honeycomb przez 14 dni za darmo"
**Back-translated:** "Try Honeycomb for 14 days, free"
**Note:** Word-order shift; PL uses "za darmo" at the end, EN places "free" finally too — but
literal would have been "Try Honeycomb free for 14 days".`;

group("back translator", [
  {
    name: "well-formed back-translation markdown",
    raw: BACK_GOOD,
    expect: (out) => {
      if (!out.back_translation.includes("Stop guessing")) return "back-trans missing";
      if (out.divergences.length !== 2) return `${out.divergences.length} divergences`;
      if (out.divergences[0].nature !== "transcreation_intent") {
        return `nature wrong: ${out.divergences[0].nature}`;
      }
      return null;
    },
  },
  {
    name: "clean round-trip (no divergences)",
    raw: `## Back-translation
Stop guessing what's blocking activation.`,
    expect: (out) =>
      out.divergences.length === 0 && out.back_translation.includes("Stop guessing")
        ? null
        : "should have 0 divergences",
  },
  {
    name: "no headings — whole response is the back-translation",
    raw: "Stop guessing what's blocking activation.",
    expect: (out) =>
      out.back_translation.includes("Stop guessing")
        ? null
        : "lost back-translation",
  },
  {
    name: "alternate nature wording: 'register shift' → register_shift",
    raw: BACK_GOOD.replace("transcreation_intent", "register shift"),
    expect: (out) =>
      out.divergences[0].nature === "register_shift"
        ? null
        : `got ${out.divergences[0].nature}`,
  },
  {
    name: "completely empty — should not throw",
    raw: "",
    expect: (out) => {
      if (!Array.isArray(out.divergences)) return "divergences not array";
      return null;
    },
  },
], parseBackTranslatorMarkdown);

console.log(`\n${totalPassed}/${totalPassed + totalFailed} passed.`);
process.exit(totalFailed === 0 ? 0 : 1);
