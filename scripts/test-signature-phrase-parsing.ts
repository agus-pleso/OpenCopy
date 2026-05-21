/**
 * Reproduces the signature-phrases extraction bug.
 *
 * Run: pnpm tsx scripts/test-signature-phrase-parsing.ts
 *
 * The document extractor asks the model for locale-tagged signature phrases as
 * `### EN` / `### PL` ... subsections under `## Signature phrases`. But the
 * voice-card parser's `splitSections` treats every heading (h1-h4) as a
 * top-level boundary, so each `### LOCALE` subsection became its own section
 * and the "signature phrases" body came back empty — `parseVoiceCardMarkdown`
 * returned `signature_phrases: { en: [], pl: [], ro: [], uk: [] }` for every
 * import. The feature silently produced nothing.
 *
 * The fix slices the signature-phrases block straight from the raw markdown
 * (from its heading to the next heading that names a known top-level section)
 * so the `### LOCALE` subsections are kept and handed to `parseSignaturePhrases`.
 */

import { parseVoiceCardMarkdown } from "../src/lib/agents/voice-card-parser";

interface Fixture {
  label: string;
  raw: string;
  /** Returns null on success or a reason string on failure. */
  expect: (out: ReturnType<typeof parseVoiceCardMarkdown>) => string | null;
}

// Everything before the signature-phrases section.
const HEAD = `## Tone descriptors
warm, calm, steady

## Persona
A steady guide who never rushes.

## Audience
Adults seeking calm.

## Reading level
plain

## Do's
- Be warm — it builds trust

## Don'ts
- Be clinical — it distances

## Required vocabulary
notice, gentle

## Forbidden vocabulary
crazy, broken`;

// Two sections after signature phrases — the block must stop at "## Rationale".
const TAIL = `## Rationale
The document stresses warmth and plain language.

## KB hint
no`;

/** Assemble a full doc with the given signature-phrases section. */
function doc(sigSection: string, opts?: { tail?: boolean }): string {
  const parts = [HEAD, sigSection];
  if (opts?.tail !== false) parts.push(TAIL);
  return parts.join("\n\n");
}

const FIXTURES: Fixture[] = [
  {
    label: "document-extractor format (### locale subsections)",
    raw: doc(`## Signature phrases
### EN
- "Take a moment to notice"
- "Small steps matter"
### PL
- "Małe kroki mają znaczenie"`),
    expect: (out) => {
      const sp = out.signature_phrases;
      if (sp.en.length !== 2) return `en expected 2, got ${sp.en.length}`;
      if (!sp.en.includes("Take a moment to notice")) return "en missing first phrase";
      if (sp.pl.length !== 1) return `pl expected 1, got ${sp.pl.length}`;
      if (out.rationale !== "The document stresses warmth and plain language.")
        return `rationale clobbered: ${JSON.stringify(out.rationale)}`;
      return null;
    },
  },
  {
    label: "all four locales EN/PL/RO/UK",
    raw: doc(`## Signature phrases
### EN
- "English phrase"
### PL
- "Polska fraza"
### RO
- "Frază românească"
### UK
- "Українська фраза"`),
    expect: (out) => {
      const sp = out.signature_phrases;
      return sp.en.length === 1 && sp.pl.length === 1 && sp.ro.length === 1 && sp.uk.length === 1
        ? null
        : `expected 1 each, got en=${sp.en.length} pl=${sp.pl.length} ro=${sp.ro.length} uk=${sp.uk.length}`;
    },
  },
  {
    label: "bold-style locale headers (**EN**)",
    raw: doc(`## Signature phrases
**EN**
- "Bolded English"
**PL**
- "Bolded Polish"`),
    expect: (out) =>
      out.signature_phrases.en.length === 1 && out.signature_phrases.pl.length === 1
        ? null
        : `bold headers lost: en=${out.signature_phrases.en.length} pl=${out.signature_phrases.pl.length}`,
  },
  {
    label: "(none) placeholder under a locale",
    raw: doc(`## Signature phrases
### EN
(none)
### PL
- "Tylko polski"`),
    expect: (out) =>
      out.signature_phrases.en.length === 0 && out.signature_phrases.pl.length === 1
        ? null
        : `none-handling wrong: en=${out.signature_phrases.en.length} pl=${out.signature_phrases.pl.length}`,
  },
  {
    label: "signature phrases as the final section",
    raw: doc(
      `## Signature phrases
### EN
- "Final section phrase"`,
      { tail: false },
    ),
    expect: (out) =>
      out.signature_phrases.en.length === 1
        ? null
        : `lost phrases when last section: ${out.signature_phrases.en.length}`,
  },
  {
    label: "h3-only headings (model downshifted every heading)",
    raw: doc(`## Signature phrases
### EN
- "Downshifted phrase"`).replace(/^## /gm, "### "),
    expect: (out) =>
      out.signature_phrases.en.length === 1
        ? null
        : `lost phrases under h3 headings: ${out.signature_phrases.en.length}`,
  },
  {
    label: "no signature phrases section (analyzer-style doc)",
    raw: `${HEAD}\n\n${TAIL}`,
    expect: (out) => {
      const sp = out.signature_phrases;
      return sp.en.length || sp.pl.length || sp.ro.length || sp.uk.length
        ? "phantom phrases from a doc with no signature section"
        : null;
    },
  },
];

let passed = 0;
let failed = 0;
for (const f of FIXTURES) {
  let reason: string | null;
  try {
    reason = f.expect(parseVoiceCardMarkdown(f.raw, { sampleCount: 1 }));
  } catch (e) {
    reason = `threw: ${(e as Error).message}`;
  }
  if (reason) {
    console.log(`[FAIL] ${f.label.padEnd(52)} ${reason}`);
    failed++;
  } else {
    console.log(`[OK]   ${f.label.padEnd(52)}`);
    passed++;
  }
}
console.log(`\n${passed}/${FIXTURES.length} passed.`);
process.exit(failed === 0 ? 0 : 1);
