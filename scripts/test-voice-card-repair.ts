/**
 * Reproduces the "response format didn't match schema" failure mode and
 * verifies the repair pipeline rescues it.
 *
 * Run: pnpm tsx scripts/test-voice-card-repair.ts
 *
 * Each FIXTURE is a representative example of the kind of output that has
 * caused `generateObject` to throw NoObjectGeneratedError in practice. They
 * are NOT real model outputs — they are minimal reductions of categories of
 * misbehavior we have observed (markdown fences, prose preamble, trailing
 * commas, missing optional fields, wrapping prose around the JSON body).
 */

import { repairJsonText, tryParseAndValidate } from "../src/lib/agents/json-repair";
import { VoiceCardSchema } from "../src/lib/agents/voice-card";

interface Fixture {
  label: string;
  /** What the model would have returned. */
  raw: string;
  /** True if the *unrepaired* form should fail (sanity check the bug). */
  expectRawToFail: boolean;
}

const VALID_BODY = `{
  "tone_descriptors": ["confident", "warm", "plainspoken"],
  "voice_persona": "A founder who's run the trenches and explains things plainly.",
  "audience": "Senior PMs at high-growth B2B SaaS who own activation metrics.",
  "reading_level": "professional",
  "dos": [
    {"rule": "Lead with the problem.", "why": "Hooks the reader who's living it."},
    {"rule": "Use concrete numbers.", "why": "Vague claims read as fluff."},
    {"rule": "Name the alternative."}
  ],
  "donts": [
    {"rule": "Use the word 'delve'.", "why": "AI tell."},
    {"rule": "Hedge with 'might'.", "why": "Erodes authority."},
    {"rule": "Stack three adjectives."}
  ],
  "required_words": ["activation", "north star"],
  "forbidden_words": ["delve", "tapestry", "leverage"],
  "rationale": "Samples consistently lead with a stuck workflow, then quantify the cost. Voice is direct without being curt."
}`;

const FIXTURES: Fixture[] = [
  {
    label: "clean JSON",
    raw: VALID_BODY,
    expectRawToFail: false,
  },
  {
    label: "wrapped in ```json fence",
    raw: "```json\n" + VALID_BODY + "\n```",
    expectRawToFail: true,
  },
  {
    label: "wrapped in plain ``` fence",
    raw: "```\n" + VALID_BODY + "\n```",
    expectRawToFail: true,
  },
  {
    label: "preamble prose before JSON",
    raw: "Here is the brand voice profile in JSON:\n\n" + VALID_BODY,
    expectRawToFail: true,
  },
  {
    label: "preamble + trailing closing remarks",
    raw:
      "Sure! Based on the samples, here is the voice profile:\n\n" +
      VALID_BODY +
      "\n\nLet me know if you'd like adjustments.",
    expectRawToFail: true,
  },
  {
    label: "trailing commas before closing braces",
    raw: VALID_BODY.replace('}\n  ],', '},\n  ],').replace(
      'forbidden_words": ["delve", "tapestry", "leverage"]',
      'forbidden_words": ["delve", "tapestry", "leverage",]',
    ),
    expectRawToFail: true,
  },
  {
    label: "fence + preamble + trailing comma combined",
    raw:
      "Output:\n```json\n" +
      VALID_BODY.replace(
        'forbidden_words": ["delve", "tapestry", "leverage"]',
        'forbidden_words": ["delve", "tapestry", "leverage",]',
      ) +
      "\n```\n",
    expectRawToFail: true,
  },
];

function runFixture(f: Fixture) {
  // Step 1: confirm the raw form behaves as expected (bug repro).
  let rawJsonOk = false;
  try {
    JSON.parse(f.raw);
    const validated = VoiceCardSchema.safeParse(JSON.parse(f.raw));
    rawJsonOk = validated.success;
  } catch {
    rawJsonOk = false;
  }

  // Step 2: run through our repair + validate pipeline.
  const result = tryParseAndValidate(VoiceCardSchema, f.raw);

  // Step 3: report.
  const repro = f.expectRawToFail ? !rawJsonOk : rawJsonOk;
  const repaired = result.ok;
  const status =
    repro && repaired ? "PASS" : !repro ? "REPRO MISS" : "FIX MISS";
  return { f, repro, repaired, status, issue: result.ok ? null : result.issue };
}

const results = FIXTURES.map(runFixture);
let passed = 0;
let failed = 0;
for (const r of results) {
  const icon = r.status === "PASS" ? "OK" : "FAIL";
  console.log(
    `[${icon}] ${r.f.label.padEnd(50)} repro=${r.repro ? "yes" : "no "} repaired=${r.repaired ? "yes" : "no "}` +
      (r.issue ? ` — ${r.issue}` : ""),
  );
  if (r.status === "PASS") passed++;
  else failed++;
}
console.log(`\n${passed}/${results.length} passed.`);
process.exit(failed === 0 ? 0 : 1);
