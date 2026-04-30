import { type VoiceCard } from "./voice-card";

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

function parseCommaList(body: string | undefined, max: number): string[] {
  if (!body) return [];
  const items = body
    .split(/[,\n]/)
    .map((s) => s.replace(/^\s*[-*•]\s*/, "").trim())
    .map((s) => s.replace(/^["']|["']$/g, "").replace(/\.$/, "").trim())
    .filter((s) => s.length > 0 && s.length <= 80);
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
      const rule = m[1].replace(/\.$/, "").trim();
      const why = m[2].replace(/\.$/, "").trim();
      if (rule.length > 0 && rule.length <= 400) {
        rules.push({ rule, why: why.length > 0 ? why : undefined });
      }
    } else {
      const rule = line.replace(/\.$/, "").trim();
      if (rule.length > 0 && rule.length <= 400) {
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

export function parseVoiceCardMarkdown(
  raw: string,
  context?: { sampleCount?: number },
): VoiceCard {
  const sections = splitSections(raw);

  const tones = parseCommaList(
    findSection(sections, "tone descriptors"),
    12,
  );
  const persona = (findSection(sections, "persona") ?? "").trim();
  const audience = (findSection(sections, "audience") ?? "").trim();
  const readingLevel = firstNonEmptyLine(findSection(sections, "reading level"));
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
  const rationale = (findSection(sections, "rationale") ?? "").trim();

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
    rationale: fallbackRationale,
  };
}
