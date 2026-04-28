import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";

/**
 * Slash-command Tiptap extension. Detects `/` at the start of a node or
 * after whitespace, then hands UI rendering off to a React component the
 * editor wires in via `configure({ suggestion: { render: ... } })`.
 */
export interface SlashCommandItem {
  command: string;
  label: string;
  hint: string;
  icon: string;
  needsSelection: boolean;
  needsPrompt: boolean;
}

export interface SlashSuggestionProps {
  items: SlashCommandItem[];
  query: string;
  range: { from: number; to: number };
  command: (item: SlashCommandItem) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any;
  clientRect?: () => DOMRect | null;
}

type SlashSuggestionOptions = Omit<
  SuggestionOptions<SlashCommandItem>,
  "editor"
>;

export const SlashCommand = Extension.create<{
  suggestion: SlashSuggestionOptions;
}>({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        command: ({ editor, range, props }: any) => {
          // The popup component invokes editor / range manipulation directly.
          // We just clear the query text here.
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .run();
          if (typeof props === "function") props({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

// Re-export ReactRenderer so consumers don't need to import from @tiptap/react too.
export { ReactRenderer };
