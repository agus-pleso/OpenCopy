/**
 * Pure parser for drafter output. Lives outside any "server-only" import so
 * it can be tested directly from a Node script.
 */

export interface DrafterOutput {
  content: string;
  rationale: string;
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
