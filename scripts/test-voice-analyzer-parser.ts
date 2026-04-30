/**
 * Reproduces the analyzer failure modes the user has hit and verifies the new
 * markdown parser is resilient.
 *
 * Run: pnpm tsx scripts/test-voice-analyzer-parser.ts
 *
 * The previous structured-output approach failed when the model returned
 * `{ tone_descriptors: [] }` or omitted fields entirely. The markdown approach
 * tolerates missing sections (filling sensible defaults) and tolerates
 * variations in formatting (different heading levels, em-dash variants, etc.).
 */

import { parseVoiceCardMarkdown } from "../src/lib/agents/voice-card-parser";

interface Fixture {
  label: string;
  raw: string;
  /** Predicates the parsed output must satisfy. Returns null on success or a reason string on failure. */
  expect: (
    out: ReturnType<typeof parseVoiceCardMarkdown>,
  ) => string | null;
}

const FULL_GOOD = `## Tone descriptors
confident, warm, plainspoken

## Persona
A founder who's been in the trenches.

## Audience
Senior PMs at high-growth B2B SaaS.

## Reading level
professional

## Do's
- Lead with the problem — Hooks the reader who's living it
- Use concrete numbers — Vague claims read as fluff
- Name the alternative

## Don'ts
- Use the word 'delve' — AI tell
- Hedge with 'might' — Erodes authority
- Stack three adjectives

## Required vocabulary
activation, north star

## Forbidden vocabulary
delve, tapestry, leverage

## Rationale
Samples consistently lead with a stuck workflow, then quantify the cost. Voice is direct without being curt.
`;

const FIXTURES: Fixture[] = [
  {
    label: "well-formed markdown",
    raw: FULL_GOOD,
    expect: (out) => {
      if (out.tone_descriptors.length < 3) return "tones too short";
      if (out.dos.length < 3) return "dos too short";
      if (!out.dos[0].rule.toLowerCase().includes("lead with"))
        return "dos[0] missing lead-with";
      if (!out.dos[0].why?.toLowerCase().includes("hooks")) return "dos[0] why missing";
      if (!out.required_words.includes("activation")) return "required missing activation";
      if (!out.voice_persona.toLowerCase().includes("founder")) return "persona missing";
      return null;
    },
  },
  {
    label: "missing tone descriptors section (was the user's bug)",
    raw: FULL_GOOD.replace(/## Tone descriptors\n[^#]+/g, ""),
    expect: (out) => {
      if (out.tone_descriptors.length === 0) return "should have a fallback tone";
      // Should not throw, should not have empty arrays anywhere required.
      return null;
    },
  },
  {
    label: "wrapped in markdown code fence",
    raw: "```markdown\n" + FULL_GOOD + "\n```",
    expect: (out) => (out.tone_descriptors.length >= 3 ? null : "tones lost in fence"),
  },
  {
    label: "preamble prose before first heading",
    raw:
      "Here is the voice profile based on the samples you provided:\n\n" +
      FULL_GOOD,
    expect: (out) => (out.voice_persona.length > 5 ? null : "persona lost"),
  },
  {
    label: "lowercase headings",
    raw: FULL_GOOD.replace(/## (Tone descriptors|Persona|Audience|Reading level|Do's|Don'ts|Required vocabulary|Forbidden vocabulary|Rationale)/g, (m) => m.toLowerCase()),
    expect: (out) => {
      if (out.tone_descriptors.length < 3) return "tones lost on lowercase";
      if (out.dos.length < 1) return "dos lost on lowercase";
      return null;
    },
  },
  {
    label: "h3 headings instead of h2",
    raw: FULL_GOOD.replace(/^## /gm, "### "),
    expect: (out) =>
      out.tone_descriptors.length >= 3 && out.dos.length >= 1
        ? null
        : "h3 broke parsing",
  },
  {
    label: "completely empty response",
    raw: "",
    expect: (out) => {
      // Should produce safe defaults instead of throwing.
      if (out.tone_descriptors.length === 0) return "no tones fallback";
      if (out.dos.length === 0) return "no dos fallback";
      return null;
    },
  },
  {
    label: "rules with hyphen separator instead of em-dash",
    raw: FULL_GOOD.replace(
      "Lead with the problem — Hooks the reader who's living it",
      "Lead with the problem - Hooks the reader who's living it",
    ),
    expect: (out) => {
      const rule = out.dos.find((d) => d.rule.toLowerCase().includes("lead with"));
      if (!rule) return "missed the rule";
      if (!rule.why?.toLowerCase().includes("hooks")) return "didn't split on hyphen";
      return null;
    },
  },
  {
    label: "alt heading style: bold without hash",
    raw: FULL_GOOD.replace(/^## (.+)$/gm, "**$1**"),
    expect: (out) => {
      if (out.tone_descriptors.length < 3) return "tones lost on bold heading";
      if (out.voice_persona.length < 5) return "persona lost on bold heading";
      return null;
    },
  },
  {
    label: "model returned alternate apostrophe in Do's / Don'ts",
    raw: FULL_GOOD.replace(/Do's/, "Dos").replace(/Don'ts/, "Donts"),
    expect: (out) =>
      out.dos.length >= 1 && out.donts.length >= 1
        ? null
        : "didn't accept alternate apostrophe",
  },
];

let passed = 0;
let failed = 0;
for (const f of FIXTURES) {
  let outcome: ReturnType<typeof parseVoiceCardMarkdown> | null = null;
  let parseErr: Error | null = null;
  try {
    outcome = parseVoiceCardMarkdown(f.raw);
  } catch (e) {
    parseErr = e as Error;
  }
  if (parseErr) {
    console.log(`[FAIL] ${f.label.padEnd(60)} threw: ${parseErr.message}`);
    failed++;
    continue;
  }
  const reason = f.expect(outcome!);
  if (reason) {
    console.log(`[FAIL] ${f.label.padEnd(60)} ${reason}`);
    failed++;
  } else {
    console.log(`[OK]   ${f.label.padEnd(60)}`);
    passed++;
  }
}
console.log(`\n${passed}/${FIXTURES.length} passed.`);
process.exit(failed === 0 ? 0 : 1);
