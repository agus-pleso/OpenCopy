"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { updateKnowledgeSource } from "@/server/actions/knowledge";

interface Props {
  sourceId: string;
  initialContent: string;
}

export function SourceContentEditor({ sourceId, initialContent }: Props) {
  const [pending, startTransition] = useTransition();
  const [content, setContent] = React.useState(initialContent);
  const [dirty, setDirty] = React.useState(false);

  const onSave = () => {
    startTransition(async () => {
      try {
        await updateKnowledgeSource({ sourceId, rawContent: content });
        toast.success("Saved + reindexing.");
        setDirty(false);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-[--color-muted-foreground]">
          <span className="tabular-nums">
            {content.length.toLocaleString()} chars
          </span>
          {dirty && (
            <Badge variant="warning" className="text-[10px] tracking-wider">
              Unsaved
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={onSave}
          disabled={pending || !dirty || content.trim().length < 20}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save & reindex
        </Button>
      </div>
      <Textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
        }}
        className="min-h-[400px] font-serif"
        style={{ fontFamily: "ui-serif, Georgia, serif" }}
        maxLength={500_000}
      />
      <p className="text-[11px] text-[--color-muted-foreground]">
        Saving re-chunks and re-embeds the entire source. Existing chunks are
        replaced atomically.
      </p>
    </div>
  );
}
