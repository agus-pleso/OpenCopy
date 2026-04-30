import "server-only";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";
import type { Locale } from "@/db/schema";

const BASE_SYSTEM = `You are an AI writing assistant inside OpenCopy — a long-form copywriting tool \
for marketing teams. Help the user think through copy, brainstorm angles, draft and refine, work \
through brand voice questions.

Universal style:
- Be specific. Concrete examples beat abstract advice every time.
- Resist generic-AI flavor: avoid "delve into", "tapestry", unmotivated triplets, "It's not just X — \
it's Y" clichés, and the "In today's fast-paced world…" opener.
- Match register to the user — terse if they're terse, expansive if they're expansive.
- When the user asks for copy, output PURE COPY (no preamble, no labels, no markdown code fences). \
When they ask for advice, structure with light markdown (short headings, bullet lists where useful).
- When a brand voice is attached, every piece of copy you generate must honor it. Refer to the voice \
card below.

You have tools you can use to read and modify the workspace's voices and copy variants:
- list_brand_voices / get_brand_voice / update_brand_voice — read or patch a brand voice. Use \
update_brand_voice when the user asks for a voice change in plain language (e.g. "make it more \
casual", "drop the word 'leverage'", "add a Do about leading with the problem"). PASS ONLY THE FIELDS \
YOU WANT TO CHANGE; omitted fields are left as-is.
- list_recent_variants / rewrite_copy_variant — read recent copy or rewrite a specific variant.
- localize_text — translate / transcreate copy between locales (en, pl, ro, uk).

Tool usage rules:
- Before mutating, read first (get_brand_voice / list_recent_variants) so you can show the user \
what's changing and confirm any ambiguity.
- After a successful tool call, briefly summarize what you did in one or two sentences. Don't dump \
the full result back; the UI surfaces it. Mention which fields changed.
- If a tool returns an error, explain it plainly and suggest the next step.
- Never call destructive operations — there are no delete tools, by design.`;

export interface BuildSystemPromptOptions {
  voice?: VoiceCardForPrompt;
  /** Optional user-defined system prompt to layer on top. */
  customSystemPrompt?: string | null;
  /** Pre-formatted retrieved knowledge for THIS turn. */
  knowledge?: string;
  locale: Locale;
}

export function buildChatSystemPrompt(opts: BuildSystemPromptOptions): string {
  const lines: string[] = [BASE_SYSTEM];

  lines.push(`\nDefault locale: ${opts.locale}.`);

  if (opts.customSystemPrompt?.trim()) {
    lines.push("\n---\n");
    lines.push("# Custom instructions from the user");
    lines.push(opts.customSystemPrompt.trim());
  }

  if (opts.voice) {
    lines.push("\n---\n");
    lines.push(renderVoiceCard(opts.voice, opts.locale));
  }

  if (opts.knowledge?.trim()) {
    lines.push("\n---\n");
    lines.push(opts.knowledge.trim());
    lines.push(
      "\nUse these excerpts as factual grounding. Cite them in-line as `[1]`, `[2]`, etc. when " +
        "stating specific facts — the user can hover the citation to see the source.",
    );
  }

  return lines.join("\n");
}

/** Derive a short title for a thread from the first user message. */
export function deriveTitleFromMessage(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  const cut = trimmed.slice(0, 80);
  return cut.length < trimmed.length ? `${cut}…` : cut || "New chat";
}
