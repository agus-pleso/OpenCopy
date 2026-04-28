import "server-only";
import { defineTextAgent } from "../core";
import { renderVoiceCard, type VoiceCardForPrompt } from "../voice-card";
import type { EditorCommand } from "./commands-shared";

export interface EditorCommandInput {
  command: EditorCommand;
  voice?: VoiceCardForPrompt;
  /** Full document plain text — gives the agent global context. */
  documentContent: string;
  /** For selection commands: the highlighted text. Empty for cursor commands. */
  target: string;
  /** For cursor commands: text immediately before / after the cursor. */
  before?: string;
  after?: string;
  /** Free-form user prompt for /compose and /change-tone. */
  prompt?: string;
}

const COMMAND_INSTRUCTIONS: Record<EditorCommand, string> = {
  compose:
    "Generate a new passage that fits naturally at the cursor position. Length: 1–3 sentences unless the user prompt asks for more.",
  continue:
    "Continue the writing from the cursor position naturally. Match the tone, rhythm, and structural choices of what came before. 1–3 sentences.",
  rephrase:
    "Rewrite the highlighted passage with the same meaning but a different phrasing. Preserve length within ~20%.",
  shorten:
    "Tighten the highlighted passage. Cut filler, fold redundant clauses, but keep every load-bearing idea. Aim for 30–50% shorter.",
  expand:
    "Lengthen the highlighted passage with substantive material — examples, specifics, color — not padding. Aim for ~50–100% longer.",
  explain:
    "Expand the highlighted passage with a clear explanation that helps the reader understand the WHY. 1–3 added sentences.",
  "change-tone":
    "Rewrite the highlighted passage in the requested tone (see user prompt). Preserve meaning and approximate length.",
  improve:
    "Improve the highlighted passage. Tighten, sharpen verbs, cut filler, replace generic words with specific ones. Don't change meaning.",
  "fix-grammar":
    "Fix grammar, spelling, and punctuation in the highlighted passage. Make NO other changes — preserve voice, structure, and word choice.",
  "make-shorter":
    "Compress the highlighted passage. Aim for ~50% shorter. Preserve every load-bearing idea.",
  "make-longer":
    "Lengthen the highlighted passage with substantive material. Aim for ~50–100% longer. No padding.",
};

const SYSTEM_BASE = `You are an inline editor assistant for OpenCopy, a long-form writing tool. \
Your job is to produce REPLACEMENT TEXT that the user pastes into their document.

Universal rules — these always apply:
- Output PURE PROSE — no preamble, no labels, no markdown code fences, no "Here's the rewrite:". \
The user's editor will paste your output verbatim into the document.
- Match the document's existing tone and structural patterns unless the command tells you otherwise.
- If a brand voice is provided, honor it: tone descriptors, do's, don'ts, required and forbidden \
vocabulary all apply.
- For selection commands, replace ONLY the highlighted text. Don't echo what comes before or after.
- For cursor commands (compose, continue), produce text that fits at the cursor — don't repeat the \
text immediately before.
- Resist generic-AI flavor: avoid "delve into", "tapestry", unmotivated triplets, em-dash addiction \
(unless the document/voice signals it), "It's not just X — it's Y" clichés.`;

function buildSystem(input: EditorCommandInput): string {
  const lines: string[] = [SYSTEM_BASE];
  lines.push("\n---\n");
  lines.push(`Current command: ${input.command}`);
  lines.push(COMMAND_INSTRUCTIONS[input.command]);
  if (input.voice) {
    lines.push("\n---\n");
    lines.push(renderVoiceCard(input.voice));
  }
  return lines.join("\n");
}

function buildPrompt(input: EditorCommandInput): string {
  const lines: string[] = [];

  const docSnippet = input.documentContent.slice(0, 6000);
  lines.push("# Document context (existing content):");
  lines.push(docSnippet || "(empty document)");
  lines.push("");

  if (input.target) {
    lines.push("# Highlighted passage to act on:");
    lines.push(`>>> ${input.target} <<<`);
    lines.push("");
  } else {
    lines.push("# Cursor position:");
    if (input.before) lines.push(`Text immediately before: …${input.before.slice(-400)}`);
    if (input.after) lines.push(`Text immediately after: ${input.after.slice(0, 400)}…`);
    lines.push("");
  }

  if (input.prompt) {
    lines.push(`# User instruction: ${input.prompt}`);
    lines.push("");
  }

  lines.push(
    `Produce the replacement text for the "${input.command}" command. Output ONLY the prose — nothing else.`,
  );
  return lines.join("\n");
}

export const editorCommandAgent = defineTextAgent<EditorCommandInput>({
  name: "editor-command",
  description:
    "Inline AI command for the long-form editor. Routes /compose, /continue, /rephrase, etc.",
  modelRole: "drafting",
  systemPrompt: buildSystem,
  buildPrompt,
  temperature: 0.7,
  maxTokens: 1500,
});

// Re-export the catalog + types from the shared module for server-side consumers.
export {
  COMMAND_CATALOG,
  type EditorCommand,
  type CommandMeta,
} from "./commands-shared";
