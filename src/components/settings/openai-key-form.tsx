"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Trash2,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { saveApiKey, deleteApiKey } from "@/server/actions/api-keys";

interface Props {
  existing?: { last4: string; updatedAt: Date | string; label: string | null };
}

export function OpenAIKeyForm({ existing }: Props) {
  const [pending, startTransition] = useTransition();
  const [deleting, startDeletion] = useTransition();
  const [editing, setEditing] = React.useState(!existing);
  const [show, setShow] = React.useState(false);
  const [apiKey, setApiKey] = React.useState("");

  const onSave = () => {
    startTransition(async () => {
      const res = await saveApiKey({
        provider: "openai",
        apiKey,
        label: "OpenAI · embeddings",
      });
      if (res.ok) {
        toast.success("OpenAI key saved.");
        setApiKey("");
        setShow(false);
        setEditing(false);
      } else {
        toast.error(res.message ?? "Could not save key.");
      }
    });
  };

  const onDelete = () => {
    startDeletion(async () => {
      await deleteApiKey("openai");
      toast.success("Key removed.");
      setEditing(true);
    });
  };

  if (existing && !editing) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-success)]/15 text-[var(--color-success)]">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium tracking-tight">OpenAI connected</p>
              <Badge variant="success" className="text-[10px] tracking-wider">
                <BookOpen className="mr-1 h-2.5 w-2.5" />
                Embeddings
              </Badge>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] font-mono">
              ••••••••{existing.last4}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Replace
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Remove key"
            className="text-[var(--color-destructive)] hover:text-[var(--color-destructive)]"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="openai-key" className="flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5" /> OpenAI API key (for embeddings)
        </Label>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Used by the knowledge base to generate embeddings via{" "}
          <code className="font-mono">text-embedding-3-small</code> (1536-dim,
          ~$0.02 per 1M tokens). Get a key at{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            platform.openai.com/api-keys
          </a>
          . Encrypted at rest.
        </p>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="openai-key"
            type={show ? "text" : "password"}
            placeholder="sk-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="pr-9 font-mono"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            aria-label={show ? "Hide key" : "Show key"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button onClick={onSave} disabled={pending || apiKey.length < 8}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
        {existing && (
          <Button variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
