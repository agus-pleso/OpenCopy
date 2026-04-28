"use client";

import * as React from "react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import { toast } from "sonner";

import { runEditorCommand, updateDocument } from "@/server/actions/documents";
import {
  COMMAND_CATALOG,
  type CommandMeta,
  type EditorCommand,
} from "@/lib/agents/editor/commands-shared";
import { SlashCommand } from "./slash-extension";
import { SlashMenu, type SlashMenuRef } from "./slash-menu";
import { BubbleActions } from "./bubble-actions";

interface EditorProps {
  documentId: string;
  initialHtml: string;
  onSave?: (state: { savingState: SaveState; lastSavedAt: Date | null }) => void;
}

type SaveState = "idle" | "saving" | "saved" | "error";

interface SlashState {
  active: boolean;
  query: string;
  range: { from: number; to: number } | null;
  rect: DOMRect | null;
  promptFor: CommandMeta | null;
  running: boolean;
}

const INITIAL_SLASH: SlashState = {
  active: false,
  query: "",
  range: null,
  rect: null,
  promptFor: null,
  running: false,
};

export function DocumentEditor({ documentId, initialHtml, onSave }: EditorProps) {
  const slashRef = React.useRef<SlashMenuRef | null>(null);
  const [slash, setSlash] = React.useState<SlashState>(INITIAL_SLASH);
  const [saveState, setSaveState] = React.useState<SaveState>("saved");
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedAtRef = React.useRef<Date | null>(new Date());

  // Keep a ref to slash state so the suggestion render callbacks always see fresh values.
  const slashRefState = React.useRef(slash);
  slashRefState.current = slash;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: "Start writing… type / to invoke an AI command.",
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-[--color-primary] underline underline-offset-2" },
      }),
      Typography,
      CharacterCount,
      SlashCommand.configure({
        suggestion: {
          char: "/",
          allowSpaces: false,
          startOfLine: false,
          items: ({ query }) => {
            const q = query.toLowerCase();
            return COMMAND_CATALOG.filter(
              (c) =>
                c.command.includes(q) ||
                c.label.toLowerCase().includes(q) ||
                c.hint.toLowerCase().includes(q),
            ).map((c) => ({
              command: c.command,
              label: c.label,
              hint: c.hint,
              icon: c.icon,
              needsSelection: c.needsSelection,
              needsPrompt: c.needsPrompt,
            }));
          },
          render: () => ({
            onStart: (props) => {
              setSlash({
                active: true,
                query: props.query,
                range: props.range,
                rect: props.clientRect?.() ?? null,
                promptFor: null,
                running: false,
              });
            },
            onUpdate: (props) => {
              setSlash((s) => ({
                ...s,
                active: true,
                query: props.query,
                range: props.range,
                rect: props.clientRect?.() ?? null,
              }));
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                setSlash(INITIAL_SLASH);
                return true;
              }
              return slashRef.current?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              setSlash(INITIAL_SLASH);
            },
          }),
        },
      }),
    ],
    content: initialHtml,
    onUpdate: ({ editor }) => {
      scheduleSave(editor);
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral max-w-none focus:outline-none min-h-[60vh] " +
          "prose-headings:font-display prose-headings:tracking-tight " +
          "prose-h1:text-4xl prose-h1:mb-3 prose-h1:mt-8 " +
          "prose-h2:text-2xl prose-h2:mt-7 prose-h2:mb-2 " +
          "prose-h3:text-xl prose-h3:mt-5 prose-h3:mb-2 " +
          "prose-p:leading-relaxed prose-p:my-3 " +
          "prose-strong:text-[--color-foreground] " +
          "prose-blockquote:border-l-2 prose-blockquote:border-[--color-primary] " +
          "prose-blockquote:bg-[--color-muted]/30 prose-blockquote:not-italic " +
          "prose-blockquote:py-1 prose-blockquote:pl-4 " +
          "prose-code:bg-[--color-muted] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] " +
          "[font-family:ui-serif,Georgia,serif] [font-size:17px]",
      },
    },
  });

  const scheduleSave = React.useCallback(
    (editor: ReturnType<typeof useEditor>) => {
      if (!editor) return;
      setSaveState("saving");
      onSave?.({ savingState: "saving", lastSavedAt: lastSavedAtRef.current });
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const html = editor.getHTML();
          const text = editor.getText();
          const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
          await updateDocument({
            documentId,
            contentHtml: html,
            contentText: text,
            wordCount,
          });
          const now = new Date();
          lastSavedAtRef.current = now;
          setSaveState("saved");
          onSave?.({ savingState: "saved", lastSavedAt: now });
        } catch (err) {
          setSaveState("error");
          onSave?.({ savingState: "error", lastSavedAt: lastSavedAtRef.current });
          toast.error("Couldn't save: " + (err as Error).message);
        }
      }, 1500);
    },
    [documentId, onSave],
  );

  // Run a slash command. The Suggestion plugin already deleted the trigger range
  // by the time onSelect is called via our callback path.
  const runSlashCommand = React.useCallback(
    async (item: CommandMeta, prompt?: string) => {
      if (!editor) return;
      const range = slashRefState.current.range;
      if (!range) return;

      // Check selection requirement
      if (item.needsSelection) {
        toast.error(
          "This command needs a selection. Highlight some text first, then use the bubble menu.",
        );
        editor.chain().focus().deleteRange(range).run();
        setSlash(INITIAL_SLASH);
        return;
      }

      // Capture cursor context BEFORE deleting the slash range.
      const docText = editor.getText();
      const beforeText = editor.state.doc.textBetween(
        Math.max(0, range.from - 800),
        range.from,
        "\n",
      );
      const afterText = editor.state.doc.textBetween(
        range.to,
        Math.min(editor.state.doc.content.size, range.to + 800),
        "\n",
      );

      // Delete the "/query" trigger text
      editor.chain().focus().deleteRange(range).run();

      setSlash((s) => ({ ...s, running: true }));

      try {
        const res = await runEditorCommand({
          documentId,
          command: item.command as EditorCommand,
          documentContent: docText,
          target: "",
          before: beforeText,
          after: afterText,
          prompt,
        });
        if (!res.ok || !res.text) {
          toast.error(res.message ?? "Command failed.");
          return;
        }
        editor.chain().focus().insertContent(res.text + " ").run();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setSlash(INITIAL_SLASH);
      }
    },
    [editor, documentId],
  );

  const handleSelect = React.useCallback(
    (item: CommandMeta) => {
      if (item.needsPrompt) {
        setSlash((s) => ({ ...s, promptFor: item }));
        return;
      }
      runSlashCommand(item);
    },
    [runSlashCommand],
  );

  // Build filtered items in render to match the Suggestion items result.
  const filteredItems = React.useMemo(() => {
    const q = slash.query.toLowerCase();
    return COMMAND_CATALOG.filter(
      (c) =>
        c.command.includes(q) ||
        c.label.toLowerCase().includes(q) ||
        c.hint.toLowerCase().includes(q),
    );
  }, [slash.query]);

  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!editor) {
    return (
      <div className="rounded-lg border border-dashed border-[--color-border] bg-[--color-muted]/30 p-8 text-center text-sm text-[--color-muted-foreground]">
        Loading editor…
      </div>
    );
  }

  const counter = editor.storage.characterCount as
    | { characters: () => number; words: () => number }
    | undefined;

  return (
    <div className="relative">
      <EditorContent editor={editor} />

      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 100 }}
        shouldShow={({ editor: ed, from, to }) => {
          if (from === to) return false;
          if (!ed.isEditable) return false;
          // Avoid showing inside code blocks.
          if (ed.isActive("codeBlock")) return false;
          return true;
        }}
      >
        <BubbleActions editor={editor} documentId={documentId} />
      </BubbleMenu>

      {slash.active && (
        <SlashMenu
          ref={slashRef}
          items={filteredItems.map((c) => ({
            command: c.command,
            label: c.label,
            hint: c.hint,
            icon: c.icon,
            needsSelection: c.needsSelection,
            needsPrompt: c.needsPrompt,
          }))}
          query={slash.query}
          rect={slash.rect}
          promptFor={slash.promptFor as unknown as SlashMenuItem | null}
          running={slash.running}
          onSelect={(item) => handleSelect(item as unknown as CommandMeta)}
          onPromptSubmit={(text) => runSlashCommand(slash.promptFor!, text)}
          onPromptCancel={() => setSlash((s) => ({ ...s, promptFor: null }))}
        />
      )}

      <div
        aria-hidden
        className="hidden"
        data-save-state={saveState}
        data-words={counter?.words() ?? 0}
        data-chars={counter?.characters() ?? 0}
      />
    </div>
  );
}

// Re-import the type used in the cast above.
import type { SlashMenuItem } from "./slash-menu";
