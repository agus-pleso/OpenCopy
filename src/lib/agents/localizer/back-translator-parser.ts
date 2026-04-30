import {
  childSections,
  findSectionLike,
  pluckField,
  splitSections,
  unwrapMarkdown,
} from "../markdown-helpers";

export type DivergenceNature =
  | "transcreation_intent"
  | "literal_loss"
  | "cultural_swap"
  | "register_shift"
  | "lengthening_or_compression"
  | "other";

export interface Divergence {
  target_excerpt: string;
  back_translated: string;
  nature: DivergenceNature;
  note: string;
}

export interface BackTranslatorOutput {
  back_translation: string;
  divergences: Divergence[];
}

const NATURE_PATTERNS: Array<[DivergenceNature, RegExp]> = [
  ["transcreation_intent", /transcreation|intent/],
  ["literal_loss", /literal[\s_-]?loss|loss/],
  ["cultural_swap", /cultural[\s_-]?swap|swap/],
  ["register_shift", /register[\s_-]?shift|register|formality/],
  ["lengthening_or_compression", /length|compress|shorten|longer/],
];

function normalizeNature(raw: string | undefined): DivergenceNature {
  if (!raw) return "other";
  const s = raw.toLowerCase();
  for (const [n, re] of NATURE_PATTERNS) {
    if (re.test(s)) return n;
  }
  return "other";
}

export function parseBackTranslatorMarkdown(raw: string): BackTranslatorOutput {
  const cleaned = unwrapMarkdown(raw);
  const sections = splitSections(cleaned);

  const backSec = findSectionLike(sections, [
    "back translation",
    "back-translation",
    "back",
  ]);
  const divergencesSec = findSectionLike(sections, ["divergences", "notes"]);

  const divergences: Divergence[] = [];
  if (divergencesSec) {
    const childs = childSections(sections, divergencesSec);
    for (const s of childs) {
      const nature = normalizeNature(s.title) || normalizeNature(pluckField(s.body, "Nature"));
      const target =
        pluckField(s.body, "Target") ??
        pluckField(s.body, "Target excerpt") ??
        "";
      const back =
        pluckField(s.body, "Back-translated") ??
        pluckField(s.body, "Back translation") ??
        pluckField(s.body, "Back") ??
        "";
      const note =
        pluckField(s.body, "Note") ??
        pluckField(s.body, "Why") ??
        "";

      if (!target.trim() && !back.trim() && !note.trim()) continue;

      divergences.push({
        target_excerpt: target.trim().slice(0, 400) || "(unspecified)",
        back_translated: back.trim().slice(0, 400) || "(unspecified)",
        nature,
        note: note.trim().slice(0, 400) || "(no note provided)",
      });
      if (divergences.length >= 10) break;
    }
  }

  let back_translation = (backSec?.body || "").trim();
  if (!back_translation) {
    // Fall back to text before the first heading, or the whole response.
    const firstHeading = sections[0];
    back_translation = firstHeading
      ? cleaned.slice(0, cleaned.indexOf(firstHeading.title)).trim()
      : cleaned;
    if (!back_translation) back_translation = cleaned;
  }

  return {
    back_translation: back_translation.slice(0, 8000),
    divergences,
  };
}
