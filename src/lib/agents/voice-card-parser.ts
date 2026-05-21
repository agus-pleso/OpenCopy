import { VOICE_CARD_LIMITS, type VoiceCard } from "./voice-card";

/**
 * Pure parser for the markdown the voice analyzer is asked to produce.
 * Lives outside any "server-only" import so it can be unit-tested directly
 * from a Node script.
 */

const SECTION_KEYS = [
  "tone descriptors",
  "persona",
  "audience",
  "reading level",
  "do's",
  "dos",
  "don'ts",
  "donts",
  "required vocabulary",
  "forbidden vocabulary",
  "signature phrases",
  "kb hint",
  "rationale",
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

function splitSections(md: string): Map<string, string> {
  const out = new Map<string, string>();
  const cleaned = md
    .replace(/^\s*```(?:markdown|md)?\s*\n([\s\S]*)\n?```\s*$/i, "$1")
    .trim();

  const headingRegex = /^(?:#{1,4}\s+(.+?)|\*\*(.+?)\*\*)\s*:?\s*$/gm;
  const matches: Array<{ title: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(cleaned))) {
    const title = (m[1] ?? m[2] ?? "").trim().toLowerCase();
    matches.push({ title, start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const { title, end } = matches[i];
    const next = matches[i + 1]?.start ?? cleaned.length;
    const body = cleaned.slice(end, next).trim();
    out.set(title, body);
  }
  return out;
}

function findSection(
  sections: Map<string, string>,
  ...keys: SectionKey[]
): string | undefined {
  for (const k of keys) {
    const v = sections.get(k);
    if (v != null) return v;
  }
  for (const k of keys) {
    for (const [title, body] of sections) {
      if (title.includes(k)) return body;
    }
  }
  return undefined;
}

/**
 * Truncate a string to `max` characters. A model occasionally over-runs the
 * section format — a paragraph where a short label was asked for, a whole
 * clause listed as one vocabulary item — and the persistence schema
 * (`UpdateCardSchema`) rejects over-long fields. Truncating keeps the value
 * (which the user still reviews before saving) instead of failing the import.
 */
function clampLen(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max).trimEnd();
}

function parseCommaList(body: string | undefined, max: number): string[] {
  if (!body) return [];
  const items = body
    .split(/[,\n]/)
    .map((s) => s.replace(/^\s*[-*•]\s*/, "").trim())
    .map((s) => s.replace(/^["']|["']$/g, "").replace(/\.$/, "").trim())
    .map((s) => clampLen(s, VOICE_CARD_LIMITS.word))
    .filter((s) => s.length > 0);
  return Array.from(new Set(items)).slice(0, max);
}

function parseRuleList(
  body: string | undefined,
  max: number,
): Array<{ rule: string; why?: string }> {
  if (!body) return [];
  const lines = body
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((l) => l.length > 0);

  const rules: Array<{ rule: string; why?: string }> = [];
  for (const line of lines) {
    const m = line.match(/^(.+?)\s+[—–-]\s+(.+)$/);
    if (m) {
      const rule = clampLen(m[1].replace(/\.$/, "").trim(), VOICE_CARD_LIMITS.rule);
      const why = clampLen(m[2].replace(/\.$/, "").trim(), VOICE_CARD_LIMITS.ruleWhy);
      if (rule.length > 0) {
        rules.push({ rule, why: why.length > 0 ? why : undefined });
      }
    } else {
      const rule = clampLen(line.replace(/\.$/, "").trim(), VOICE_CARD_LIMITS.rule);
      if (rule.length > 0) {
        rules.push({ rule });
      }
    }
    if (rules.length >= max) break;
  }
  return rules;
}

function firstNonEmptyLine(body: string | undefined): string {
  if (!body) return "";
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

/**
 * Parse the "## Signature phrases" section.
 *
 * Expected format the model is asked for:
 *
 *     ## Signature phrases
 *     ### EN
 *     - "Take a moment to notice"
 *     - "Small steps matter"
 *     ### PL
 *     - "Pozwól sobie zauważyć"
 *     ### RO
 *     (none)
 *     ### UK
 *     -
 *
 * We're tolerant: bullets optional, quotes optional, locale codes case-insensitive,
 * empty subsections OK. Non-recognised locale codes are dropped.
 */
function parseSignaturePhrases(
  body: string | undefined,
): Partial<Record<"en" | "pl" | "ro" | "uk", string[]>> {
  const out: Partial<Record<"en" | "pl" | "ro" | "uk", string[]>> = {};
  if (!body) return out;

  // Split on h3 / bold-locale / bare-locale-line headers.
  const subHeaderRegex = /^(?:#{2,4}\s+|\*\*\s*)([a-zA-Z]{2})\s*\*?\*?\s*:?\s*$/gm;
  type Section = { locale: string; start: number; end: number };
  const sections: Section[] = [];
  let m: RegExpExecArray | null;
  while ((m = subHeaderRegex.exec(body))) {
    sections.push({ locale: m[1].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }

  if (sections.length === 0) {
    return out;
  }

  for (let i = 0; i < sections.length; i++) {
    const { locale, end } = sections[i];
    const next = sections[i + 1]?.start ?? body.length;
    const slice = body.slice(end, next).trim();
    const phrases = slice
      .split("\n")
      .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
      .map((l) => l.replace(/^["“”]+|["“”]+$/g, "").trim())
      .filter((l) => l.length > 0 && !/^\(?(none|n\/a|empty)\)?$/i.test(l) && l.length <= 200);
    const dedup = Array.from(new Set(phrases)).slice(0, 30);
    if (locale === "en" || locale === "pl" || locale === "ro" || locale === "uk") {
      out[locale] = dedup;
    }
  }
  return out;
}

/**
 * Parse the optional "## KB hint" section. Format the agent is asked for:
 *
 *     ## KB hint
 *     yes — Pages 4-7 list policy details that should live in Knowledge.
 *     (or)
 *     no
 *
 * Returns null when the agent says no / section absent.
 */
export function parseKbHint(body: string | undefined): { reason: string } | null {
  if (!body) return null;
  const first = firstNonEmptyLine(body).toLowerCase();
  if (!first || /^(no|none|n\/a)\b/.test(first)) return null;
  if (/^(yes|likely|probably)\b/.test(first)) {
    // Take whatever comes after the yes (separator or next line)
    const reason = body
      .replace(/^\s*(yes|likely|probably)\b[\s\-—–:]*/i, "")
      .trim();
    return { reason: reason || "The document contains factual or policy content that may belong in the knowledge base." };
  }
  // If the model wrote a paragraph without yes/no, treat presence as a soft yes.
  return { reason: body.trim() };
}

export function parseVoiceCardMarkdown(
  raw: string,
  context?: { sampleCount?: number },
): VoiceCard {
  const sections = splitSections(raw);

  const tones = parseCommaList(
    findSection(sections, "tone descriptors"),
    12,
  );
  const persona = clampLen(
    (findSection(sections, "persona") ?? "").trim(),
    VOICE_CARD_LIMITS.voicePersona,
  );
  const audience = clampLen(
    (findSection(sections, "audience") ?? "").trim(),
    VOICE_CARD_LIMITS.audience,
  );
  const readingLevel = clampLen(
    firstNonEmptyLine(findSection(sections, "reading level")),
    VOICE_CARD_LIMITS.readingLevel,
  );
  const dos = parseRuleList(findSection(sections, "do's", "dos"), 12);
  const donts = parseRuleList(findSection(sections, "don'ts", "donts"), 12);
  const required = parseCommaList(
    findSection(sections, "required vocabulary"),
    20,
  );
  const forbidden = parseCommaList(
    findSection(sections, "forbidden vocabulary"),
    20,
  );
  const sigPhrases = parseSignaturePhrases(findSection(sections, "signature phrases"));
  const rationale = clampLen(
    (findSection(sections, "rationale") ?? "").trim(),
    VOICE_CARD_LIMITS.rationale,
  );

  const sampleCount = context?.sampleCount ?? 0;
  const fallbackRationale =
    rationale ||
    `Profile drafted from ${sampleCount} sample${sampleCount === 1 ? "" : "s"}. The model's output was sparse — consider adding more samples or trying a stronger model for sharper observations.`;

  return {
    tone_descriptors: tones.length > 0 ? tones : ["unspecified"],
    voice_persona: persona || "Voice persona not extracted from samples.",
    audience: audience || "Audience not extracted from samples.",
    reading_level: readingLevel || "professional",
    dos:
      dos.length > 0
        ? dos
        : [{ rule: "Match the patterns observed in the writing samples." }],
    donts:
      donts.length > 0
        ? donts
        : [{ rule: "Avoid voice or tone the samples don't support." }],
    required_words: required,
    forbidden_words: forbidden,
    signature_phrases: {
      en: sigPhrases.en ?? [],
      pl: sigPhrases.pl ?? [],
      ro: sigPhrases.ro ?? [],
      uk: sigPhrases.uk ?? [],
    },
    rationale: fallbackRationale,
  };
}

/**
 * Re-export the section splitter so the document-extractor agent can extract
 * the optional "## KB hint" section without re-implementing the regex.
 */
export function splitVoiceCardSections(raw: string): Map<string, string> {
  return splitSections(raw);
}
