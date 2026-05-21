/**
 * Reproduces the tone-of-voice document-import crash.
 *
 * Run: pnpm tsx scripts/test-document-extractor-clamp.ts
 *
 * Symptom: importing a wordy ToV document threw a ZodError on save —
 *   too_big at `readingLevel` (max 60) and `forbiddenWords[6]` (max 40) —
 * *after* the review dialog had already displayed the extracted card.
 *
 * Cause: the document extractor (and the voice analyzer) funnel every model
 * response through `parseVoiceCardMarkdown`. That parser did not bound string
 * lengths, so a model that answered "## Reading level" with a sentence, or
 * listed a whole clause under "## Forbidden vocabulary", produced a card the
 * persistence schema (`UpdateCardSchema`) rejected.
 *
 * Fix: the parser clamps every field to `VOICE_CARD_LIMITS` — the single
 * constant `UpdateCardSchema` is also built from — so a parsed card is always
 * saveable.
 */

import { parseVoiceCardMarkdown } from "../src/lib/agents/voice-card-parser";
import { VOICE_CARD_LIMITS } from "../src/lib/agents/voice-card";

/** Build a readable string of at least `min` characters. */
function atLeast(sentence: string, min: number): string {
  let s = sentence.trim();
  while (s.length < min) s += " " + sentence.trim();
  return s;
}

// A full clause where the prompt asked for short vocabulary items. Sized into
// the 61-80 range: long enough to break the limit, short enough that the old
// parser's loose `<= 80` filter still let it through (so it reached the save).
const LONG_FORBIDDEN =
  "wording that frames a personal struggle as a moral failing or pure weakness";

// A sentence where the prompt asked for a short reading-level label.
const LONG_READING_LEVEL =
  "A general adult readership with no clinical training, around an eighth to tenth grade level";

const LONG_PERSONA = atLeast(
  "A warm, steady guide who has sat with people through hard seasons and never rushes them.",
  VOICE_CARD_LIMITS.voicePersona + 150,
);
const LONG_AUDIENCE = atLeast(
  "Adults navigating anxiety, burnout or grief who want practical, non-clinical support.",
  VOICE_CARD_LIMITS.audience + 150,
);
const LONG_RATIONALE = atLeast(
  "The document stresses warmth, patience and plain language over clinical distance throughout.",
  VOICE_CARD_LIMITS.rationale + 250,
);
const LONG_WHY = atLeast(
  "the document is emphatic that the reader must feel met before they are ever advised",
  VOICE_CARD_LIMITS.ruleWhy + 120,
);

const RAW = `## Tone descriptors
warm, calm, reassuring, plainspoken, unhurried, grounded

## Persona
${LONG_PERSONA}

## Audience
${LONG_AUDIENCE}

## Reading level
${LONG_READING_LEVEL}

## Do's
- Lead with the reader's felt experience — ${LONG_WHY}
- Use second-person throughout — it keeps the writing personal

## Don'ts
- Diagnose or label the reader — the brand is supportive, not clinical

## Required vocabulary
notice, gentle, practice, room to breathe

## Forbidden vocabulary
crazy, insane, suffer, victim, broken, snap out of it, ${LONG_FORBIDDEN}

## Rationale
${LONG_RATIONALE}

## KB hint
no
`;

/* -- setup sanity: confirm the fixture genuinely reproduces the bug -- */
const setupProblems: string[] = [];
if (LONG_READING_LEVEL.length <= VOICE_CARD_LIMITS.readingLevel) {
  setupProblems.push("reading-level fixture is not over the limit");
}
if (LONG_FORBIDDEN.length <= VOICE_CARD_LIMITS.word || LONG_FORBIDDEN.length > 80) {
  setupProblems.push(
    `forbidden fixture must be ${VOICE_CARD_LIMITS.word + 1}-80 chars, is ${LONG_FORBIDDEN.length}`,
  );
}
if (setupProblems.length) {
  console.log("[SETUP FAIL] " + setupProblems.join("; "));
  process.exit(1);
}

console.log(
  `Repro input: reading-level line ${LONG_READING_LEVEL.length} chars ` +
    `(limit ${VOICE_CARD_LIMITS.readingLevel}); forbidden phrase ` +
    `${LONG_FORBIDDEN.length} chars (limit ${VOICE_CARD_LIMITS.word}).\n`,
);

const out = parseVoiceCardMarkdown(RAW, { sampleCount: 1 });

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}
const checks: Check[] = [];

function within(label: string, value: string, limit: number) {
  checks.push({
    label,
    ok: value.length <= limit,
    detail: `${value.length}/${limit} chars`,
  });
}

function everyWithin(label: string, values: string[], limit: number) {
  const longest = values.reduce((m, v) => Math.max(m, v.length), 0);
  checks.push({
    label,
    ok: values.every((v) => v.length <= limit),
    detail: `longest ${longest}/${limit} chars across ${values.length} item(s)`,
  });
}

within("reading_level within limit", out.reading_level, VOICE_CARD_LIMITS.readingLevel);
within("voice_persona within limit", out.voice_persona, VOICE_CARD_LIMITS.voicePersona);
within("audience within limit", out.audience, VOICE_CARD_LIMITS.audience);
within("rationale within limit", out.rationale, VOICE_CARD_LIMITS.rationale);

everyWithin("tone_descriptors within limit", out.tone_descriptors, VOICE_CARD_LIMITS.word);
everyWithin("required_words within limit", out.required_words, VOICE_CARD_LIMITS.word);
everyWithin("forbidden_words within limit", out.forbidden_words, VOICE_CARD_LIMITS.word);

const rules = [...out.dos, ...out.donts];
everyWithin(
  "rule text within limit",
  rules.map((r) => r.rule),
  VOICE_CARD_LIMITS.rule,
);
everyWithin(
  "rule rationale (why) within limit",
  rules.flatMap((r) => (r.why ? [r.why] : [])),
  VOICE_CARD_LIMITS.ruleWhy,
);

/* -- content preservation: clamping must truncate, not discard -- */
checks.push({
  label: "reading_level kept (truncated, not blanked)",
  ok: out.reading_level.length > 0 && LONG_READING_LEVEL.startsWith(out.reading_level),
  detail: JSON.stringify(out.reading_level),
});
checks.push({
  label: "long forbidden item kept (truncated, not dropped)",
  ok:
    out.forbidden_words.length === 7 &&
    out.forbidden_words.some((w) => w.length > 0 && LONG_FORBIDDEN.startsWith(w)),
  detail: `${out.forbidden_words.length} item(s)`,
});

let failed = 0;
for (const c of checks) {
  console.log(`[${c.ok ? "OK" : "FAIL"}] ${c.label.padEnd(46)} ${c.detail}`);
  if (!c.ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed.`);
process.exit(failed === 0 ? 0 : 1);
