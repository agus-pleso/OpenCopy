/**
 * Verify the brand-profile-conversationalist parser handles the variations
 * weaker models produce. Pure parser — no DB, no Next.js — runs in tsx.
 *
 * Run: pnpm tsx scripts/test-brand-profile-conversationalist-parser.ts
 */

import {
  parseConversationalistTurnMarkdown,
  CONVERSATIONALIST_AXES,
  type ConversationalistAxis,
} from "../src/lib/agents/brand-profile-conversationalist-parser";

interface Fixture {
  label: string;
  raw: string;
  fallbackAxis?: ConversationalistAxis;
  expect: (out: ReturnType<typeof parseConversationalistTurnMarkdown>) => string | null;
}

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

const FIXTURES: Fixture[] = [
  {
    label: "well-formed turn with all three sections",
    raw: `## Question
What's the tagline that captures the brand's promise in five words or fewer?

## Captured
\`\`\`json
{
  "name": "Acme Coffee",
  "voice.en": {
    "toneDescriptors": ["warm", "wry"],
    "formality": 4
  }
}
\`\`\`

## Axis next
knowledge`,
    expect: (out) => {
      if (!out.question.includes("tagline")) return `bad question: ${out.question}`;
      if (out.axisNext !== "knowledge") return `axis=${out.axisNext}`;
      if (out.capturedPatch?.name !== "Acme Coffee") return "name missing";
      const voiceEn = (out.capturedPatch as Record<string, unknown> | null)?.[
        "voice.en"
      ] as Record<string, unknown> | undefined;
      if (!voiceEn) return "voice.en missing";
      if (
        !Array.isArray(voiceEn.toneDescriptors) ||
        (voiceEn.toneDescriptors as string[])[0] !== "warm"
      ) {
        return "toneDescriptors not parsed";
      }
      return null;
    },
  },
  {
    label: "no captured section — mid-axis follow-up",
    raw: `## Question
Got it — when you say "warm", do you mean warm-curious like a barista who knows you, or warm-instructive like a barista teaching a class?

## Axis next
voice`,
    expect: (out) => {
      if (out.capturedPatch !== null) return "capturedPatch should be null";
      if (out.axisNext !== "voice") return `axis=${out.axisNext}`;
      if (!out.question.includes("warm-curious")) return "question lost";
      return null;
    },
  },
  {
    label: "missing axis next falls back to provided axis",
    raw: `## Question
What does Friday morning look like for your favourite customer?`,
    fallbackAxis: "audience",
    expect: (out) => {
      if (out.axisNext !== "audience") return `axis=${out.axisNext}, expected audience`;
      if (out.capturedPatch !== null) return "capturedPatch should be null";
      return null;
    },
  },
  {
    label: "malformed captured JSON drops to null without throwing",
    raw: `## Question
Tell me about your pain points.

## Captured
{ this is not valid json at all }

## Axis next
audience`,
    expect: (out) => {
      if (out.capturedPatch !== null)
        return `capturedPatch should be null, got ${JSON.stringify(out.capturedPatch)}`;
      if (out.axisNext !== "audience") return "axis lost";
      return null;
    },
  },
  {
    label: "axis with synonym normalises",
    raw: `## Question
Anything else?

## Axis next
complete`,
    expect: (out) => {
      if (out.axisNext !== "done") return `axis=${out.axisNext}, expected done`;
      return null;
    },
  },
  {
    label: "captured wrapped in plain JSON without fence",
    raw: `## Question
Got it.

## Captured
{ "tagline": "Coffee for people who notice", "values": ["transparency", "craft"] }

## Axis next
knowledge`,
    expect: (out) => {
      if (!out.capturedPatch || out.capturedPatch.tagline !== "Coffee for people who notice") {
        return "tagline not parsed";
      }
      const v = out.capturedPatch.values;
      if (!Array.isArray(v) || (v as string[])[0] !== "transparency") {
        return "values not parsed";
      }
      return null;
    },
  },
  {
    label: "missing question — entire body becomes the question fallback",
    raw: `(no headings just prose here)`,
    expect: (out) => {
      if (!out.question.includes("prose")) return `bad fallback question: ${out.question}`;
      if (out.capturedPatch !== null) return "patch should be null";
      return null;
    },
  },
  {
    label: "captured (none) collapses to null",
    raw: `## Question
Anything to add?

## Captured
(none)

## Axis next
done`,
    expect: (out) => {
      if (out.capturedPatch !== null) return "should be null";
      if (out.axisNext !== "done") return "axis lost";
      return null;
    },
  },
  {
    label: "all axes round-trip via normalizer",
    raw: ``, // not used; we'll just exercise the enum
    expect: () => null,
  },
];

async function main() {
  let passed = 0;
  for (const fix of FIXTURES) {
    if (fix.label.startsWith("all axes")) continue;
    const out = parseConversationalistTurnMarkdown(fix.raw, fix.fallbackAxis);
    const msg = fix.expect(out);
    if (msg) fail(`${fix.label}: ${msg}`);
    passed++;
    console.log(`✓ ${fix.label}`);
  }

  // Confirm every axis name maps to itself.
  for (const axis of CONVERSATIONALIST_AXES) {
    const out = parseConversationalistTurnMarkdown(
      `## Question\nq\n## Axis next\n${axis}`,
      "voice",
    );
    if (out.axisNext !== axis) {
      fail(`axis '${axis}' did not round-trip; got '${out.axisNext}'`);
    }
  }
  console.log(`✓ all ${CONVERSATIONALIST_AXES.length} axis names round-trip`);
  passed++;

  console.log(`\n✓ ${passed} fixtures clean`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
