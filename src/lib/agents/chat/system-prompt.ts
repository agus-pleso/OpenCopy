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
card below.`;

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
