/**
 * Tolerant parser for the brand-profile conversationalist agent's markdown
 * output. Lives outside `server-only` so it can be unit-tested directly from
 * a tsx script.
 *
 * Expected shape, per turn:
 *
 *     ## Question
 *     <the actual question to ask the marketer>
 *
 *     ## Captured            (optional — only when consolidating an axis)
 *     ```json
 *     { "voice": { "en": { "toneDescriptors": [...] } } }
 *     ```
 *
 *     ## Axis next
 *     voice                  (one of voice | knowledge | audience | positioning |
 *                             competitors | samples | locales | done)
 *
 * Tolerant rules:
 *   - Sections may appear in any order.
 *   - Missing `## Question` → fallback to the whole stripped text.
 *   - Missing `## Captured` → `capturedPatch` is null.
 *   - Malformed JSON in `## Captured` → drop the patch, log nothing.
 *   - Missing / unknown `## Axis next` → fallback to caller-provided default.
 */

import {
  findSectionLike,
  splitSections,
  unwrapMarkdown,
} from "./markdown-helpers";

export const CONVERSATIONALIST_AXES = [
  "voice",
  "knowledge",
  "audience",
  "positioning",
  "competitors",
  "samples",
  "locales",
  "done",
] as const;

export type ConversationalistAxis = (typeof CONVERSATIONALIST_AXES)[number];

export interface ConversationalistTurn {
  question: string;
  capturedPatch: Record<string, unknown> | null;
  axisNext: ConversationalistAxis;
}

function normalizeAxis(raw: string | undefined): ConversationalistAxis | null {
  if (!raw) return null;
  const tightened = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
  for (const v of CONVERSATIONALIST_AXES) {
    if (tightened === v) return v;
  }
  // Looser substring match. Order matters: "done"/"complete" check first so
  // "complete" doesn't get caught by the "comp" → "competitors" rule below.
  if (tightened.startsWith("done") || tightened.startsWith("complete") || tightened.startsWith("finish")) {
    return "done";
  }
  if (tightened.startsWith("voice")) return "voice";
  if (tightened.startsWith("knowledge") || tightened.startsWith("know")) return "knowledge";
  if (tightened.startsWith("audience") || tightened.startsWith("aud")) return "audience";
  if (tightened.startsWith("position") || tightened === "pos") return "positioning";
  if (tightened.startsWith("competit") || tightened.startsWith("comp")) return "competitors";
  if (tightened.startsWith("sample")) return "samples";
  if (tightened.startsWith("locale") || tightened.startsWith("lang")) return "locales";
  return null;
}

/**
 * Pull JSON from inside a section body. Accepts either a fenced JSON block
 * (```json ... ```) or a bare JSON object. Returns `null` for any failure
 * mode — empty body, malformed JSON, non-object value.
 */
function extractJsonPatch(body: string | undefined): Record<string, unknown> | null {
  if (!body) return null;
  const fenceMatch = body.match(/```(?:json)?\s*\n([\s\S]+?)\n?```/i);
  let candidate = fenceMatch ? fenceMatch[1] : body;
  candidate = candidate.trim();

  // Some models emit "(none)" or "n/a" instead of empty.
  if (/^\(?(none|n\/a|empty|null|nothing)\)?\.?$/i.test(candidate)) return null;

  // Find the first { ... } block; tolerate trailing prose.
  const firstBrace = candidate.indexOf("{");
  if (firstBrace < 0) return null;
  // Walk to the matching close brace (depth-aware, ignoring strings).
  let depth = 0;
  let inString = false;
  let escape = false;
  let endIdx = -1;
  for (let i = firstBrace; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx < 0) return null;

  try {
    const parsed = JSON.parse(candidate.slice(firstBrace, endIdx + 1));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseConversationalistTurnMarkdown(
  raw: string,
  fallbackAxis: ConversationalistAxis = "voice",
): ConversationalistTurn {
  const cleaned = unwrapMarkdown(raw);
  const sections = splitSections(cleaned);

  const qSection = findSectionLike(sections, ["question", "next question", "ask"]);
  const capturedSection = findSectionLike(sections, [
    "captured",
    "captured fields",
    "captured patch",
    "extracted",
    "extracted patch",
  ]);
  const axisSection = findSectionLike(sections, [
    "axis next",
    "next axis",
    "axis",
    "next",
  ]);

  // Question fallback: when no `## Question` heading is present, the whole
  // stripped text becomes the assistant turn — better to ask a slightly
  // off-formatted question than to ask nothing at all.
  const question =
    (qSection?.body ?? "").trim() ||
    cleaned.replace(/^#.*$/gm, "").trim() ||
    "(missing question)";

  const capturedPatch = extractJsonPatch(capturedSection?.body);

  const axisNext = normalizeAxis(axisSection?.body) ?? fallbackAxis;

  return {
    question,
    capturedPatch,
    axisNext,
  };
}
