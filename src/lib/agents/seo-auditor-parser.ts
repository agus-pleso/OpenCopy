/**
 * Tolerant parser for the SEO auditor agent's markdown output.
 *
 * The auditor LLM emits a structured-ish response with:
 *   - `## Detected intent` (one of informational/commercial/transactional/navigational)
 *   - `## Suggestions` with `### N. <type>` sub-sections, each carrying:
 *       Excerpt: <verbatim slice of the doc> (optional)
 *       Description: <one-paragraph rationale>
 *
 * Sections may appear in any order, headings may carry extra prose, the
 * model may forget the "Excerpt:" label entirely. Parser stays robust:
 * missing pieces become empty defaults, malformed suggestion blocks are
 * dropped (not thrown).
 *
 * Pure — no `server-only`, no DB. Exported types reuse the schema's
 * SeoIntent / SeoSuggestionType enums.
 */

import type { SeoIntent, SeoSuggestion, SeoSuggestionType } from "@/db/schema";

import {
  childSections,
  findSectionLike,
  pluckField,
  splitSections,
  unwrapMarkdown,
} from "./markdown-helpers";

const INTENT_VALUES = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
] as const satisfies readonly SeoIntent[];

const SUGGESTION_TYPES = [
  "rewrite_paragraph",
  "add_section",
  "tighten_section",
  "add_lsi_keyword",
  "add_heading",
] as const satisfies readonly SeoSuggestionType[];

export interface ParsedSeoAudit {
  detectedIntent?: SeoIntent;
  suggestions: Omit<SeoSuggestion, "proposed" | "appliedAt" | "rejectedAt">[];
}

/** Normalise a candidate intent string into the enum. */
export function normalizeIntent(raw: string | undefined): SeoIntent | undefined {
  if (!raw) return undefined;
  const lower = raw.trim().toLowerCase();
  // Exact match on a single normalized token.
  const tightened = lower.replace(/[^a-z]/g, "");
  for (const v of INTENT_VALUES) {
    if (tightened === v) return v;
  }
  if (tightened.startsWith("info")) return "informational";
  if (tightened.startsWith("commer")) return "commercial";
  if (tightened.startsWith("transact") || tightened === "buy" || tightened === "purchase")
    return "transactional";
  if (tightened.startsWith("nav") || tightened === "brand") return "navigational";

  // Looser: scan the raw text for any of the four intent words. Useful
  // when the model wraps the answer in prose ("clearly INFORMATIONAL in
  // nature.").
  for (const v of INTENT_VALUES) {
    if (new RegExp(`\\b${v}\\b`, "i").test(raw)) return v;
  }
  return undefined;
}

/** Normalise a candidate suggestion type into the enum. */
export function normalizeSuggestionType(
  raw: string | undefined,
): SeoSuggestionType | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  for (const v of SUGGESTION_TYPES) {
    if (s === v) return v;
  }
  // Lenient matches for variants the model might emit.
  if (/rewrite|edit|revise/.test(s) && /paragraph|sentence|copy/.test(s)) {
    return "rewrite_paragraph";
  }
  if (/add[_\s]+section|new[_\s]+section/.test(s)) return "add_section";
  if (/tighten|compress|trim|shorten/.test(s)) return "tighten_section";
  if (/lsi|related[_\s]+keyword|semantic[_\s]+keyword|synonym/.test(s)) {
    return "add_lsi_keyword";
  }
  if (/add[_\s]+heading|new[_\s]+heading|h2|h3/.test(s)) return "add_heading";
  if (/rewrite/.test(s)) return "rewrite_paragraph";
  return undefined;
}

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Parse a single suggestion sub-section. Returns null if it's not
 * recoverable (no usable description, no usable type).
 */
function parseSuggestion(
  heading: string,
  body: string,
):
  | Omit<SeoSuggestion, "proposed" | "appliedAt" | "rejectedAt">
  | null {
  // Try to pluck the type from the heading. Common shapes:
  //   "1. rewrite_paragraph"
  //   "Rewrite paragraph"
  //   "Type: add_heading"
  //   "Add heading — about pricing"
  let type: SeoSuggestionType | undefined;

  // Strip leading enumeration ("1.", "2.", "(3)") before type extraction.
  const stripped = heading.replace(/^\s*[\d.()]+\s*/, "").trim();
  type = normalizeSuggestionType(stripped);

  if (!type) {
    // Try anywhere in the heading.
    type = normalizeSuggestionType(heading);
  }

  // Fall back to a Type: field in the body.
  if (!type) {
    type = normalizeSuggestionType(pluckField(body, "Type"));
  }

  // Last resort: scan body for type keywords.
  if (!type) {
    type = normalizeSuggestionType(body);
  }

  const excerpt =
    pluckField(body, "Excerpt") ??
    pluckField(body, "Quote") ??
    pluckField(body, "Text") ??
    undefined;

  // Description = first non-field-line, joined paragraphs.
  let description =
    pluckField(body, "Description") ??
    pluckField(body, "Why") ??
    pluckField(body, "Reason") ??
    pluckField(body, "Rationale") ??
    "";

  if (!description) {
    // Strip recognised label lines, keep the rest as the description.
    // The label match requires a colon (or bold-wrapped colon) — without
    // it, prose like "Description 1." would be misidentified as a field
    // and dropped.
    description = body
      .split("\n")
      .filter(
        (l) =>
          !/^\s*(?:\*\*)?(excerpt|quote|text|type|description|why|reason|rationale|fix|proposed)(?:\*\*)?\s*:/i.test(
            l,
          ),
      )
      .join("\n")
      .trim();
  }

  description = description.replace(/^["']|["']$/g, "").trim();

  if (!type) return null;
  if (!description) return null;

  return {
    id: uuid(),
    type,
    status: "pending",
    excerpt: excerpt?.slice(0, 1000),
    description: description.slice(0, 1000),
  };
}

export function parseSeoAuditMarkdown(raw: string): ParsedSeoAudit {
  const cleaned = unwrapMarkdown(raw);
  const sections = splitSections(cleaned);

  const intentSec = findSectionLike(sections, [
    "detected intent",
    "intent",
    "search intent",
  ]);
  const detectedIntent = intentSec
    ? normalizeIntent(intentSec.body.split("\n")[0] || intentSec.body)
    : undefined;

  const suggestionsSec = findSectionLike(sections, [
    "suggestions",
    "recommendations",
    "fixes",
  ]);

  const suggestions: ParsedSeoAudit["suggestions"] = [];
  if (suggestionsSec) {
    const children = childSections(sections, suggestionsSec);
    for (const child of children) {
      const parsed = parseSuggestion(child.title, child.body);
      if (parsed) suggestions.push(parsed);
    }
  }

  // Cap at 12 — beyond that the UI gets unusable and the LLM is probably
  // pattern-matching its own filler.
  return { detectedIntent, suggestions: suggestions.slice(0, 12) };
}
