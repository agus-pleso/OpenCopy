import {
  childSections,
  findSectionLike,
  pluckField,
  splitSections,
} from "../markdown-helpers";

export type AdapterCategory =
  | "idiom"
  | "cultural_reference"
  | "formality"
  | "honorifics"
  | "regional_term"
  | "humor"
  | "measurement_or_currency"
  | "name_or_brand"
  | "other";

export type AdapterRisk = "low" | "medium" | "high";

export interface AdapterNote {
  excerpt: string;
  category: AdapterCategory;
  risk: AdapterRisk;
  guidance: string;
}

export interface CulturalAdapterOutput {
  notes: AdapterNote[];
  formality_recommendation: string;
  length_expectation: string;
}

const CATEGORY_KEYWORDS: Array<[AdapterCategory, RegExp]> = [
  ["idiom", /idiom/],
  ["cultural_reference", /cultural[\s_-]?reference|reference/],
  ["formality", /formal/],
  ["honorifics", /honorific/],
  ["regional_term", /regional|dialect/],
  ["humor", /humor|humour|joke/],
  ["measurement_or_currency", /measurement|currency|unit/],
  ["name_or_brand", /name|brand|proper[\s_-]?noun/],
];

function normalizeCategory(raw: string | undefined): AdapterCategory {
  if (!raw) return "other";
  const s = raw.toLowerCase();
  for (const [cat, re] of CATEGORY_KEYWORDS) {
    if (re.test(s)) return cat;
  }
  return "other";
}

function normalizeRisk(raw: string | undefined): AdapterRisk {
  if (!raw) return "medium";
  const s = raw.toLowerCase();
  if (/(high|critical|major)/.test(s)) return "high";
  if (/(low|minor|small)/.test(s)) return "low";
  return "medium";
}

export function parseCulturalAdapterMarkdown(
  raw: string,
): CulturalAdapterOutput {
  const sections = splitSections(raw);

  const formalitySec = findSectionLike(sections, ["formality"]);
  const lengthSec = findSectionLike(sections, [
    "length expectation",
    "length",
  ]);
  const notesSec = findSectionLike(sections, ["notes", "items", "issues"]);

  const formality_recommendation =
    (formalitySec?.body || "").trim().slice(0, 400) ||
    "Default to the locale's neutral register; lean formal in B2B contexts.";

  const length_expectation =
    (lengthSec?.body || "").trim().slice(0, 400) ||
    "Expect modest length variation between source and target.";

  const notes: AdapterNote[] = [];
  if (notesSec) {
    const childs = childSections(sections, notesSec);
    for (const s of childs) {
      // Title patterns:
      //   "high · idiom"
      //   "Note 1 (medium, formality)"
      //   "[high] idiom"
      let category: AdapterCategory | undefined;
      let risk: AdapterRisk | undefined;

      const riskMatch = s.title.match(/\b(high|medium|low|critical|major|minor)\b/);
      if (riskMatch) risk = normalizeRisk(riskMatch[1]);

      const catMatch = s.title.match(
        /\b(idiom|cultural[_\s-]?reference|formality|honorifics?|regional|humou?r|measurement|currency|name|brand)\b/,
      );
      if (catMatch) category = normalizeCategory(catMatch[1]);

      const bodyRisk = pluckField(s.body, "Risk");
      const bodyCat = pluckField(s.body, "Category");
      if (!risk && bodyRisk) risk = normalizeRisk(bodyRisk);
      if (!category && bodyCat) category = normalizeCategory(bodyCat);

      const excerpt =
        pluckField(s.body, "Excerpt") ??
        pluckField(s.body, "Source") ??
        pluckField(s.body, "Quote") ??
        "";
      const guidance =
        pluckField(s.body, "Guidance") ??
        pluckField(s.body, "Advice") ??
        pluckField(s.body, "Note") ??
        "";

      if (!excerpt.trim() && !guidance.trim()) continue;

      notes.push({
        excerpt: excerpt.trim().slice(0, 400),
        category: category ?? "other",
        risk: risk ?? "medium",
        guidance:
          guidance.trim().slice(0, 400) || "(no specific guidance provided)",
      });
      if (notes.length >= 20) break;
    }
  }

  return { notes, formality_recommendation, length_expectation };
}
