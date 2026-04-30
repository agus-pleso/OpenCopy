import {
  childSections,
  findSectionLike,
  pluckField,
  splitSections,
  unwrapMarkdown,
} from "../markdown-helpers";

export interface TranscreationDecision {
  source_excerpt: string;
  target_excerpt: string;
  rationale: string;
}

export interface LocalizerOutput {
  target_text: string;
  decisions: TranscreationDecision[];
}

/**
 * Parse the transcreator's markdown response. The format we ask for is:
 *
 *   ## Target text
 *   [the localized copy]
 *
 *   ## Decisions
 *
 *   ### Decision 1
 *   **Source:** "..."
 *   **Target:** "..."
 *   **Why:** ...
 *
 * If the model omits headings entirely, the whole response is treated as the
 * target text — better to keep the localized copy than lose the run.
 */
export function parseLocalizerMarkdown(raw: string): LocalizerOutput {
  const cleaned = unwrapMarkdown(raw);
  const sections = splitSections(cleaned);

  const targetSec = findSectionLike(sections, [
    "target text",
    "target",
    "translation",
    "transcreation",
  ]);
  const decisionsSec = findSectionLike(sections, ["decisions", "notes"]);

  const target_text = (targetSec?.body || "").trim();

  const decisions: TranscreationDecision[] = [];
  if (decisionsSec) {
    const childs = childSections(sections, decisionsSec);
    for (const s of childs) {
      const source =
        pluckField(s.body, "Source") ??
        pluckField(s.body, "Source excerpt") ??
        pluckField(s.body, "From") ??
        "";
      const target =
        pluckField(s.body, "Target") ??
        pluckField(s.body, "Target excerpt") ??
        pluckField(s.body, "To") ??
        "";
      const rationale =
        pluckField(s.body, "Why") ??
        pluckField(s.body, "Rationale") ??
        pluckField(s.body, "Reason") ??
        "";

      if (!source.trim() && !target.trim()) continue;

      decisions.push({
        source_excerpt: source.trim().slice(0, 400) || "(unspecified)",
        target_excerpt: target.trim().slice(0, 400) || "(unspecified)",
        rationale: rationale.trim().slice(0, 400) || "(rationale not provided)",
      });
      if (decisions.length >= 15) break;
    }
  }

  // If no Target section was found, the whole response IS the target. We
  // strip any "## Decisions" section we might have parsed out so the user
  // doesn't get a giant chunk of meta-commentary as their localized copy.
  let final_target = target_text;
  if (!final_target) {
    if (decisionsSec) {
      // Take everything before the first heading.
      const firstHeading = sections[0];
      final_target = cleaned
        .slice(0, firstHeading ? cleaned.indexOf(firstHeading.title) : cleaned.length)
        .trim();
      if (!final_target) final_target = cleaned;
    } else {
      final_target = cleaned;
    }
  }

  return {
    target_text: final_target.slice(0, 8000),
    decisions,
  };
}
