"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  Loader2,
  ShieldCheck,
  Trash2,
  Server,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { saveApiKey, deleteApiKey } from "@/server/actions/api-keys";

interface ExistingOllama {
  baseUrl: string | null;
  updatedAt: Date | string;
}

interface Props {
  existing?: ExistingOllama;
}

const DEFAULT_URL = "http://localhost:11434/api";

export function OllamaConfigForm({ existing }: Props) {
  const [pending, startTransition] = useTransition();
  const [deleting, startDeletion] = useTransition();
  const [editing, setEditing] = React.useState(!existing);
  const [baseUrl, setBaseUrl] = React.useState(existing?.baseUrl ?? DEFAULT_URL);

  const onSave = () => {
    startTransition(async () => {
      const res = await saveApiKey({
        provider: "ollama",
        apiKey: "",
        baseUrl,
        label: "Ollama (local)",
      });
      if (res.ok) {
        toast.success("Ollama URL saved.");
        setEditing(false);
      } else {
        toast.error(res.message ?? "Could not save Ollama URL.");
      }
    });
  };

  const onDelete = () => {
    startDeletion(async () => {
      await deleteApiKey("ollama");
      toast.success("Ollama removed.");
      setEditing(true);
      setBaseUrl(DEFAULT_URL);
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
              <p className="font-medium tracking-tight">Ollama configured</p>
              <Badge variant="success" className="text-[10px] tracking-wider">
                Local
              </Badge>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] font-mono truncate">
              {existing.baseUrl ?? DEFAULT_URL}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Remove Ollama"
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
        <Label htmlFor="ollama-url" className="flex items-center gap-2">
          <Server className="h-3.5 w-3.5" /> Ollama base URL
        </Label>
        <p className="text-xs text-[var(--color-muted-foreground)] text-pretty">
          Point at your Ollama instance. Default for local installs:{" "}
          <code className="font-mono">{DEFAULT_URL}</code>. For a remote
          self-hosted setup, use the full HTTPS URL. No API key required —
          requests stay on your network.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          id="ollama-url"
          type="url"
          placeholder={DEFAULT_URL}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
        <Button onClick={onSave} disabled={pending || !baseUrl}>
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
