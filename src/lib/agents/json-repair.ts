import type { z } from "zod";

/**
 * Pure helpers for recovering structured output from a misbehaving model.
 * Kept free of any "server-only" or DB imports so they can be unit-tested
 * directly from a plain Node script.
 */

/**
 * Strip common model misbehaviors before JSON parsing:
 *  - Markdown code fences (```json ... ``` or just ``` ... ```)
 *  - Leading/trailing prose ("Here is the JSON:", "Sure! ...")
 *  - Trailing commas
 *  - Stray content before/after the outermost JSON value
 */
export function repairJsonText(text: string): string {
  let s = text.trim();

  const fence = s.match(/^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fence) s = fence[1].trim();

  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  const start =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
      ? firstBrace
      : Math.min(firstBrace, firstBracket);
  const lastBrace = s.lastIndexOf("}");
  const lastBracket = s.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  if (start > 0 || (end >= 0 && end < s.length - 1)) {
    s = s.slice(start === -1 ? 0 : start, end === -1 ? undefined : end + 1);
  }

  s = s.replace(/,(\s*[}\]])/g, "$1");

  return s;
}

export function tryParseAndValidate<T>(
  schema: z.ZodType<T>,
  raw: string,
): { ok: true; value: T } | { ok: false; issue: string } {
  const cleaned = repairJsonText(raw);
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, issue: `JSON parse failed: ${(e as Error).message}` };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  const first = result.error.issues[0];
  const path = first?.path.length ? first.path.join(".") : "(root)";
  return { ok: false, issue: `${path}: ${first?.message ?? "unknown issue"}` };
}
