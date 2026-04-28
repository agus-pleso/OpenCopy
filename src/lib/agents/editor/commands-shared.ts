/**
 * Shared types + catalog for the editor command system. Lives outside
 * `server-only` modules so client components (slash menu, bubble actions)
 * can import the catalog without dragging server-only into the client bundle.
 */

export type EditorCommand =
  | "compose"
  | "continue"
  | "rephrase"
  | "shorten"
  | "expand"
  | "explain"
  | "change-tone"
  | "improve"
  | "fix-grammar"
  | "make-shorter"
  | "make-longer";

export interface CommandMeta {
  command: EditorCommand;
  label: string;
  hint: string;
  icon: string;
  needsSelection: boolean;
  needsPrompt: boolean;
}

export const COMMAND_CATALOG: CommandMeta[] = [
  {
    command: "compose",
    label: "Compose",
    hint: "Write something at the cursor",
    icon: "Sparkles",
    needsSelection: false,
    needsPrompt: true,
  },
  {
    command: "continue",
    label: "Continue writing",
    hint: "Pick up where you left off",
    icon: "PenLine",
    needsSelection: false,
    needsPrompt: false,
  },
  {
    command: "rephrase",
    label: "Rephrase",
    hint: "Different phrasing, same meaning",
    icon: "Repeat",
    needsSelection: true,
    needsPrompt: false,
  },
  {
    command: "shorten",
    label: "Shorten",
    hint: "Tighten by ~30–50%",
    icon: "ChevronsLeftRight",
    needsSelection: true,
    needsPrompt: false,
  },
  {
    command: "expand",
    label: "Expand",
    hint: "Lengthen with substance",
    icon: "ChevronsRightLeft",
    needsSelection: true,
    needsPrompt: false,
  },
  {
    command: "explain",
    label: "Explain",
    hint: "Add the WHY",
    icon: "MessageSquareMore",
    needsSelection: true,
    needsPrompt: false,
  },
  {
    command: "change-tone",
    label: "Change tone",
    hint: "e.g. 'more direct', 'wittier'",
    icon: "Wand2",
    needsSelection: true,
    needsPrompt: true,
  },
  {
    command: "improve",
    label: "Improve",
    hint: "Sharpen verbs, cut filler",
    icon: "Sparkle",
    needsSelection: true,
    needsPrompt: false,
  },
  {
    command: "fix-grammar",
    label: "Fix grammar",
    hint: "Grammar / spelling only",
    icon: "Check",
    needsSelection: true,
    needsPrompt: false,
  },
];
