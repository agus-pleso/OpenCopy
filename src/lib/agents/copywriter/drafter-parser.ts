/**
 * Pure parser for drafter output. Lives outside any "server-only" import so
 * it can be tested directly from a Node script.
 */

export interface DrafterOutput {
  /**
   * Single-string copy view. For legacy single-shot drafts this is the
   * model's actual output. For multi-component drafts (V2.4) this is a
   * deterministic concatenation of `components` so existing UI / library
   * paths (which expect a single string) keep working.
   */
  content: string;
  rationale: string;
  /**
   * V2.4 — present iff the drafter was asked for labeled component sections
   * (campaign flow with a channel_definition). Keys are component ids the
   * drafter was asked for; values are the model's text for each. Missing
   * required components surface as empty strings here so downstream code
   * has a stable shape.
   */
  components?: Record<string, string>;
}

const SEPARATOR_RE = /^\s*-{3,}\s*$/m;

/** Parse a "copy --- rationale" response, with a permissive fallback. */
export function parseDrafterOutput(raw: string): DrafterOutput {
  const stripped = raw
    .replace(/^\s*```(?:markdown|md|text)?\s*\n([\s\S]*?)\n?```\s*$/i, "$1")
    .trim();

  const match = stripped.match(SEPARATOR_RE);
  if (match && match.index !== undefined) {
    const content = stripped.slice(0, match.index).trim();
    const rationale = stripped
      .slice(match.index + match[0].length)
      .trim();
    if (content.length > 0) {
      return {
        content,
        rationale:
          rationale.length > 0
            ? rationale
            : "Rationale not provided by the model.",
      };
    }
  }

  // No separator (or empty content before it) — assume the entire response is
  // the copy. Better to keep the copy than lose the run.
  return {
    content: stripped,
    rationale: "Rationale not provided by the model.",
  };
}

/**
 * Parse a multi-component drafter response (V2.4 channel-definition flow).
 *
 * Expected output shape (the drafter is asked for this in `buildPrompt` when
 * `components` is provided on input):
 *
 *     # subject
 *     Five tips that ship before lunch
 *
 *     # body
 *     Multi-paragraph body…
 *
 *     # cta
 *     Read the playbook
 *
 *     ---
 *     Rationale: leans on the team's signature "ship before lunch" tagline,
 *     keeps body short for inbox preview…
 *
 * Tolerant: bullet headings (`# subject`, `## subject`, `**subject**`),
 * unknown sections are dropped, missing required ones return "" (caller can
 * then surface them in the audit). Rationale separator (`---`) is optional;
 * if absent, everything between sections is treated as components.
 */
export function parseMultiComponentDrafterOutput(
  raw: string,
  expectedIds: string[],
): DrafterOutput {
  const stripped = raw
    .replace(/^\s*```(?:markdown|md|text)?\s*\n([\s\S]*?)\n?```\s*$/i, "$1")
    .trim();

  // Split off the trailing rationale block on `---` if present.
  let sectionsBody = stripped;
  let rationale = "Rationale not provided by the model.";
  const sepMatch = stripped.match(SEPARATOR_RE);
  if (sepMatch && sepMatch.index !== undefined) {
    sectionsBody = stripped.slice(0, sepMatch.index).trim();
    const tail = stripped.slice(sepMatch.index + sepMatch[0].length).trim();
    if (tail.length > 0) {
      rationale = tail.replace(/^Rationale[:\s]*/i, "").trim() || tail;
    }
  }

  // Walk component headings. Accept `#` `##` `###` or `**id**` styles. We
  // collect ALL heading positions so a recognised section's body is bounded
  // by the next heading regardless of whether that next heading is itself
  // recognised — an unknown `# extra_field` between known sections must NOT
  // bleed into the previous known section's body.
  const headingRegex = /^(?:#{1,4}\s+(.+?)|\*\*(.+?)\*\*)\s*:?\s*$/gm;
  const expected = new Set(expectedIds.map((id) => id.toLowerCase()));
  type Heading = { id: string | null; lineStart: number; bodyStart: number };
  const allHeadings: Heading[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(sectionsBody))) {
    const norm = (m[1] ?? m[2] ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    allHeadings.push({
      id: expected.has(norm) ? norm : null,
      lineStart: m.index,
      bodyStart: m.index + m[0].length,
    });
  }

  const components: Record<string, string> = {};
  for (const id of expectedIds) components[id] = "";

  for (let i = 0; i < allHeadings.length; i++) {
    const { id, bodyStart } = allHeadings[i];
    if (!id) continue;
    // Body ends where the NEXT heading (recognised or not) begins, so unknown
    // sections don't leak into the previous known section.
    const end = allHeadings[i + 1]?.lineStart ?? sectionsBody.length;
    components[id] = sectionsBody.slice(bodyStart, end).trim();
  }

  // If parser found NOTHING (no headings recognised), fall back to single-shot
  // parse so the user at least sees the model's text rather than empty fields.
  const anyFound = expectedIds.some((id) => components[id].length > 0);
  if (!anyFound) {
    const single = parseDrafterOutput(raw);
    // Stuff the whole content into the first required (or first-listed)
    // component so it surfaces somewhere visible.
    if (expectedIds.length > 0) {
      components[expectedIds[0]] = single.content;
    }
    return {
      content: single.content,
      rationale: single.rationale,
      components,
    };
  }

  // Compose the legacy single-string `content` view: concatenate components
  // in the order they were requested with their labels for readability.
  const composed = expectedIds
    .map((id) => {
      const v = components[id]?.trim();
      if (!v) return null;
      return `[${id}]\n${v}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return {
    content: composed || stripped,
    rationale,
    components,
  };
}
