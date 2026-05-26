/**
 * Verify applyNlPatch's set/append/remove semantics over dotted paths.
 *
 * Pure — no DB, no Next.js — runs in tsx.
 *
 * Run: pnpm tsx scripts/test-brand-profile-editor-patch-apply.ts
 */

import { applyNlPatch } from "../src/lib/agents/brand-profile-patch";
import type { BrandProfile } from "../src/db/schema";
import type { NlPatchChange } from "../src/lib/agents/brand-profile-editor";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

function makeBaseProfile(): BrandProfile {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    workspaceId: "00000000-0000-0000-0000-000000000010",
    name: "Acme Coffee",
    tagline: "Specialty roasts",
    mission: null,
    values: ["transparency", "craft"],
    locales: ["en", "pl"],
    voice: {
      en: {
        toneDescriptors: ["warm", "wry"],
        voicePersona: "Neighborhood barista",
        audience: "Coffee enthusiasts",
        readingLevel: "8th grade",
        formality: 3,
        emotionalRegister: "warm-curious",
        dos: [{ rule: "Use specific origin language", why: "Coffee people parse for it" }],
        donts: [{ rule: "Avoid 'curated'" }],
        vocabularyPreferences: ["single-origin"],
        requiredWords: [],
        forbiddenWords: ["curated"],
        samplePieces: [],
        fromSampleAnalysis: false,
      },
      pl: {
        toneDescriptors: ["ciepły"],
        voicePersona: "...",
        audience: "...",
        readingLevel: "...",
        formality: 4,
        emotionalRegister: "ciepły-ciekawski",
        dos: [],
        donts: [],
        vocabularyPreferences: [],
        requiredWords: [],
        forbiddenWords: [],
        samplePieces: [],
        fromSampleAnalysis: false,
      },
    },
    knowledge: { offerings: [], facts: [], faqs: [] },
    audiences: {},
    positioning: {
      differentiators: ["On-site roasting", "Published margins"],
      brandValues: ["Transparency"],
      standsFor: [],
      standsAgainst: ["Mystery blends"],
    },
    competitors: [
      {
        id: "blue-bottle",
        name: "Blue Bottle",
        url: "https://bluebottlecoffee.com",
        positioning: "Hipster precision",
        whyTheyWin: ["Design"],
        whyWeWin: ["Smaller batch"],
      },
    ],
    onboardingComplete: false,
    createdByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function main() {
  // -----------------------------------------------------------------------
  // 1. set on top-level scalar.
  // -----------------------------------------------------------------------
  {
    const base = makeBaseProfile();
    const changes: NlPatchChange[] = [
      { field: "tagline", op: "set", value: "Coffee for people who notice" },
    ];
    const { profile: next, diff } = applyNlPatch(base, changes);
    if (next.tagline !== "Coffee for people who notice") fail("set tagline failed");
    if (base.tagline !== "Specialty roasts") fail("base mutated");
    if (diff.length !== 1) fail("diff missing");
    if (diff[0].before !== "Specialty roasts") fail("before lost");
    console.log("✓ set on top-level scalar");
  }

  // -----------------------------------------------------------------------
  // 2. set on dotted path (voice.pl.formality).
  // -----------------------------------------------------------------------
  {
    const base = makeBaseProfile();
    const { profile: next } = applyNlPatch(base, [
      { field: "voice.pl.formality", op: "set", value: 8 },
    ]);
    if (next.voice.pl?.formality !== 8) fail("voice.pl.formality not set");
    if (base.voice.pl?.formality !== 4) fail("base voice mutated");
    if (next.voice.en?.formality !== 3) fail("voice.en should be unchanged");
    console.log("✓ set on dotted path");
  }

  // -----------------------------------------------------------------------
  // 3. set creates intermediate keys.
  // -----------------------------------------------------------------------
  {
    const base = makeBaseProfile();
    const { profile: next } = applyNlPatch(base, [
      {
        field: "voice.ro",
        op: "set",
        value: {
          toneDescriptors: ["calm"],
          voicePersona: "Romanian voice",
          audience: "RO audience",
          readingLevel: "8th",
          formality: 5,
          emotionalRegister: "warm",
          dos: [],
          donts: [],
          vocabularyPreferences: [],
          requiredWords: [],
          forbiddenWords: [],
          samplePieces: [],
          fromSampleAnalysis: false,
        },
      },
    ]);
    if (!next.voice.ro) fail("voice.ro should be created");
    if (next.voice.ro.toneDescriptors[0] !== "calm") fail("ro tone wrong");
    console.log("✓ set creates intermediate keys");
  }

  // -----------------------------------------------------------------------
  // 4. append a string to an array.
  // -----------------------------------------------------------------------
  {
    const base = makeBaseProfile();
    const { profile: next } = applyNlPatch(base, [
      { field: "voice.en.forbiddenWords", op: "append", value: "artisanal" },
    ]);
    if (
      !next.voice.en?.forbiddenWords.includes("curated") ||
      !next.voice.en?.forbiddenWords.includes("artisanal")
    ) {
      fail(`append failed: ${JSON.stringify(next.voice.en?.forbiddenWords)}`);
    }
    if (base.voice.en?.forbiddenWords.length !== 1) fail("base array mutated");
    console.log("✓ append string to array");
  }

  // -----------------------------------------------------------------------
  // 5. append an array of strings (spreads each item).
  // -----------------------------------------------------------------------
  {
    const base = makeBaseProfile();
    const { profile: next } = applyNlPatch(base, [
      {
        field: "voice.en.forbiddenWords",
        op: "append",
        value: ["artisanal", "synergy"],
      },
    ]);
    if (next.voice.en?.forbiddenWords.length !== 3)
      fail(`expected 3, got ${next.voice.en?.forbiddenWords.length}`);
    console.log("✓ append array spreads each item");
  }

  // -----------------------------------------------------------------------
  // 6. append a rule object to voice.en.dos.
  // -----------------------------------------------------------------------
  {
    const base = makeBaseProfile();
    const { profile: next } = applyNlPatch(base, [
      {
        field: "voice.en.dos",
        op: "append",
        value: { rule: "Never use exclamation marks", why: "Brand voice is dry" },
      },
    ]);
    if (next.voice.en?.dos.length !== 2) fail("dos append failed");
    if (next.voice.en.dos[1].rule !== "Never use exclamation marks") fail("rule wrong");
    console.log("✓ append rule object");
  }

  // -----------------------------------------------------------------------
  // 7. remove a string from an array by value.
  // -----------------------------------------------------------------------
  {
    const base = makeBaseProfile();
    const { profile: next } = applyNlPatch(base, [
      { field: "voice.en.forbiddenWords", op: "remove", value: "curated" },
    ]);
    if (next.voice.en?.forbiddenWords.length !== 0)
      fail(`remove failed: ${JSON.stringify(next.voice.en?.forbiddenWords)}`);
    if (base.voice.en?.forbiddenWords.includes("curated") === false)
      fail("base mutated");
    console.log("✓ remove string from array");
  }

  // -----------------------------------------------------------------------
  // 8. remove an object by id.
  // -----------------------------------------------------------------------
  {
    const base = makeBaseProfile();
    const { profile: next } = applyNlPatch(base, [
      { field: "competitors", op: "remove", value: { id: "blue-bottle" } },
    ]);
    if (next.competitors.length !== 0) fail(`competitor not removed: ${next.competitors.length}`);
    if (base.competitors.length !== 1) fail("base mutated");
    console.log("✓ remove competitor by id");
  }

  // -----------------------------------------------------------------------
  // 9. remove with no value deletes the key entirely.
  // -----------------------------------------------------------------------
  {
    const base = makeBaseProfile();
    const { profile: next } = applyNlPatch(base, [
      { field: "tagline", op: "remove" },
    ]);
    if (next.tagline !== undefined) fail("tagline should be undefined");
    if (Object.prototype.hasOwnProperty.call(next, "tagline")) fail("key should be deleted");
    console.log("✓ remove with no value deletes key");
  }

  // -----------------------------------------------------------------------
  // 10. multiple changes apply in order; diff records each.
  // -----------------------------------------------------------------------
  {
    const base = makeBaseProfile();
    const { profile: next, diff } = applyNlPatch(base, [
      { field: "voice.pl.formality", op: "set", value: 9 },
      { field: "values", op: "append", value: "neighborhood-first" },
      { field: "positioning.standsAgainst", op: "remove", value: "Mystery blends" },
    ]);
    if (next.voice.pl?.formality !== 9) fail("set 1 failed");
    if (next.values?.length !== 3) fail("append failed");
    if (next.positioning?.standsAgainst.length !== 0) fail("remove failed");
    if (diff.length !== 3) fail(`diff length=${diff.length}`);
    console.log("✓ multi-change apply with diff");
  }

  // -----------------------------------------------------------------------
  // 11. empty changes is a no-op.
  // -----------------------------------------------------------------------
  {
    const base = makeBaseProfile();
    const { profile: next, diff } = applyNlPatch(base, []);
    if (next.tagline !== base.tagline) fail("no-op mutated");
    if (diff.length !== 0) fail("no-op produced diff");
    console.log("✓ empty changes is no-op");
  }

  console.log("\n✓ patch-apply suite clean");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
