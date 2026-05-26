/**
 * Verify the brand-profile-extractor markdown parser handles partial,
 * malformed, and well-formed output.
 *
 * Run: pnpm tsx scripts/test-brand-profile-extractor-parser.ts
 */

import { parseExtractorOutputMarkdown } from "../src/lib/agents/brand-profile-extractor-parser";

const fail = (msg: string): never => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

interface Fixture {
  label: string;
  raw: string;
  expect: (out: ReturnType<typeof parseExtractorOutputMarkdown>) => string | null;
}

const FULL_GOOD = `## Brand name
Acme Coffee

## Tagline
Specialty roasts for people who notice

## Mission
We roast on-site and publish wholesale margins because coffee shouldn't be a guess.

## Values
- transparency
- craft
- neighborhood-first

## Locales
en, pl

## Voice
### EN
\`\`\`json
{
  "toneDescriptors": ["warm", "plainspoken", "wry"],
  "voicePersona": "A neighborhood barista who roasts the beans themselves.",
  "audience": "Coffee enthusiasts who already know the difference.",
  "readingLevel": "8th grade",
  "formality": 3,
  "emotionalRegister": "warm-curious",
  "dos": [{"rule": "Use specific origin language", "why": "Coffee people parse for it"}],
  "donts": [{"rule": "Avoid 'curated' as an adjective"}],
  "vocabularyPreferences": ["single-origin", "tasting notes"],
  "requiredWords": [],
  "forbiddenWords": ["curated", "artisanal"],
  "samplePieces": [],
  "fromSampleAnalysis": false
}
\`\`\`

### PL
\`\`\`json
{
  "toneDescriptors": ["ciepły", "bezpośredni"],
  "voicePersona": "Sąsiedzki barista...",
  "audience": "Miłośnicy kawy",
  "readingLevel": "ósma klasa",
  "formality": 4,
  "emotionalRegister": "ciepły-ciekawski",
  "dos": [],
  "donts": [],
  "vocabularyPreferences": [],
  "requiredWords": [],
  "forbiddenWords": [],
  "samplePieces": [],
  "fromSampleAnalysis": false
}
\`\`\`

## Knowledge
\`\`\`json
{
  "offerings": [
    {"name": "Espresso blend", "description": "House blend, medium roast", "category": "coffee"},
    {"name": "Single origin pour-overs", "description": "Rotating monthly selection"}
  ],
  "facts": [
    {"fact": "Beans roasted in-house within 7 days of brewing"},
    "Cafe operates Tu-Sun 7am-3pm"
  ],
  "faqs": [
    {"question": "Do you ship?", "answer": "Yes, to PL + EU within 48h."}
  ]
}
\`\`\`

## Audiences
### EN
\`\`\`json
[
  {
    "id": "home-enthusiast",
    "name": "Home enthusiast",
    "demographics": "25-45, urban, $80k+ HHI",
    "psychographics": "Reads sourcing pages, owns a grinder",
    "painPoints": ["Stale grocery-store beans"],
    "jobsToBeDone": ["Replicate cafe espresso at home"],
    "decisionCriteria": ["Roast date visible"]
  }
]
\`\`\`

## Positioning
\`\`\`json
{
  "differentiators": ["Roasts on-site, no warehouse middlemen", "Publishes wholesale margins"],
  "brandValues": ["Transparency", "Craft"],
  "standsFor": ["Origin clarity"],
  "standsAgainst": ["Mystery blends"]
}
\`\`\`

## Competitors
\`\`\`json
[
  {
    "id": "blue-bottle",
    "name": "Blue Bottle",
    "url": "https://bluebottlecoffee.com",
    "positioning": "Hipster precision brand",
    "whyTheyWin": ["Strong design language", "Cafe presence"],
    "whyWeWin": ["Smaller batch", "Roast date transparency"]
  }
]
\`\`\``;

const PARTIAL = `## Brand name
Acme Coffee

## Values
transparency, craft

## Voice
### EN
\`\`\`json
{
  "toneDescriptors": ["warm"],
  "voicePersona": "...",
  "audience": "...",
  "readingLevel": "8th",
  "formality": 4,
  "emotionalRegister": "",
  "dos": [],
  "donts": [],
  "vocabularyPreferences": [],
  "requiredWords": [],
  "forbiddenWords": [],
  "samplePieces": [],
  "fromSampleAnalysis": false
}
\`\`\`
`;

const MALFORMED_JSON = `## Brand name
Foo

## Knowledge
\`\`\`json
{ this is not valid: json
\`\`\`

## Competitors
not even close to JSON
`;

const SNAKE_CASE_FIELDS = `## Brand name
Bar

## Voice
### EN
\`\`\`json
{
  "tone_descriptors": ["warm", "direct"],
  "voice_persona": "...",
  "audience": "...",
  "reading_level": "...",
  "formality": "5",
  "emotional_register": "...",
  "dos": ["Use plain English"],
  "donts": [{"rule": "no jargon"}],
  "vocabulary_preferences": ["pour-over"],
  "required_words": [],
  "forbidden_words": [],
  "sample_pieces": [],
  "from_sample_analysis": true
}
\`\`\`
`;

const FIXTURES: Fixture[] = [
  {
    label: "full well-formed output round-trips",
    raw: FULL_GOOD,
    expect: (out) => {
      if (out.name !== "Acme Coffee") return `name=${out.name}`;
      if (out.tagline !== "Specialty roasts for people who notice")
        return `tagline=${out.tagline}`;
      if (!out.mission?.startsWith("We roast")) return "mission missing";
      if (!out.values || out.values.length !== 3) return `values=${JSON.stringify(out.values)}`;
      if (!out.locales || out.locales.join(",") !== "en,pl") return `locales=${out.locales}`;

      if (!out.voice?.en) return "voice.en missing";
      if (out.voice.en.toneDescriptors[0] !== "warm") return "voice.en tone wrong";
      if (out.voice.en.formality !== 3) return "voice.en formality wrong";
      if (!out.voice?.pl) return "voice.pl missing";
      if (out.voice.pl.formality !== 4) return "voice.pl formality wrong";

      if (!out.knowledge) return "knowledge missing";
      if (out.knowledge.offerings.length !== 2) return "offerings count wrong";
      if (out.knowledge.facts.length !== 2) return "facts count wrong (string + object)";
      if (out.knowledge.facts[1].fact !== "Cafe operates Tu-Sun 7am-3pm")
        return "string fact not parsed";
      if (out.knowledge.faqs.length !== 1) return "faqs missing";

      if (!out.audiences?.en) return "audiences.en missing";
      if (out.audiences.en[0].id !== "home-enthusiast") return "audience id wrong";

      if (!out.positioning) return "positioning missing";
      if (out.positioning.differentiators.length !== 2)
        return `diff count=${out.positioning.differentiators.length}`;

      if (!out.competitors || out.competitors.length !== 1) return "competitors missing";
      if (out.competitors[0].url !== "https://bluebottlecoffee.com")
        return "competitor url wrong";
      return null;
    },
  },
  {
    label: "partial output — only some sections present",
    raw: PARTIAL,
    expect: (out) => {
      if (out.name !== "Acme Coffee") return `name=${out.name}`;
      if (out.tagline !== undefined) return "tagline should be undefined";
      if (out.mission !== undefined) return "mission should be undefined";
      if (!out.values || out.values.length !== 2)
        return `values=${JSON.stringify(out.values)}`;
      if (!out.voice?.en) return "voice.en missing";
      if (out.knowledge !== undefined) return "knowledge should be undefined";
      if (out.competitors !== undefined) return "competitors should be undefined";
      return null;
    },
  },
  {
    label: "malformed JSON drops the value without throwing",
    raw: MALFORMED_JSON,
    expect: (out) => {
      if (out.name !== "Foo") return "name lost";
      if (out.knowledge !== undefined) return "knowledge should be undefined on bad JSON";
      if (out.competitors !== undefined) return "competitors should be undefined on bad text";
      return null;
    },
  },
  {
    label: "snake_case field aliases get coerced to camelCase",
    raw: SNAKE_CASE_FIELDS,
    expect: (out) => {
      const v = out.voice?.en;
      if (!v) return "voice.en missing";
      if (!Array.isArray(v.toneDescriptors) || v.toneDescriptors[0] !== "warm")
        return "tone via snake_case lost";
      if (v.formality !== 5) return `formality should coerce to 5, got ${v.formality}`;
      if (!Array.isArray(v.vocabularyPreferences) || v.vocabularyPreferences[0] !== "pour-over")
        return "vocab pref lost";
      if (v.fromSampleAnalysis !== true) return "fromSampleAnalysis lost";
      if (v.dos.length !== 1 || v.dos[0].rule !== "Use plain English")
        return "string-rule dos lost";
      if (v.donts.length !== 1 || v.donts[0].rule !== "no jargon")
        return "object-rule donts lost";
      return null;
    },
  },
  {
    label: "completely empty input returns empty object",
    raw: ``,
    expect: (out) => {
      if (Object.keys(out).length !== 0) return `should be empty, got ${JSON.stringify(out)}`;
      return null;
    },
  },
  {
    label: "competitors with name only (no url) still parse",
    raw: `## Competitors
\`\`\`json
[{"name": "Blue Bottle"}]
\`\`\``,
    expect: (out) => {
      if (!out.competitors || out.competitors.length !== 1) return "should have 1 competitor";
      if (out.competitors[0].name !== "Blue Bottle") return "name wrong";
      if (out.competitors[0].url !== undefined) return "url should be undefined";
      if (out.competitors[0].id !== "blue-bottle") return "id should be derived from name";
      return null;
    },
  },
];

async function main() {
  let passed = 0;
  for (const fix of FIXTURES) {
    const out = parseExtractorOutputMarkdown(fix.raw);
    const msg = fix.expect(out);
    if (msg) fail(`${fix.label}: ${msg}`);
    passed++;
    console.log(`✓ ${fix.label}`);
  }
  console.log(`\n✓ ${passed} fixtures clean`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
