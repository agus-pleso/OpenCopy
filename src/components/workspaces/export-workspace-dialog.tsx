"use client";

import * as React from "react";
import { Download, Loader2, Lock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  trigger?: React.ReactNode;
}

export function ExportWorkspaceDialog({ trigger }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [includeEmbeddings, setIncludeEmbeddings] = React.useState(true);
  const [usePassphrase, setUsePassphrase] = React.useState(false);
  const [passphrase, setPassphrase] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  const passphraseValid =
    !usePassphrase || (passphrase.length >= 8 && passphrase === confirm);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphraseValid) return;
    setPending(true);
    try {
      const res = await fetch("/api/workspace/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeEmbeddings,
          passphrase: usePassphrase ? passphrase : undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `export failed (${res.status})`);
      }
      const blob = await res.blob();
      const filename =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "workspace.opencopy";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Workspace exported");
      setOpen(false);
      setPassphrase("");
      setConfirm("");
      setUsePassphrase(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" /> Export
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Download className="h-5 w-5" />
            </div>
            <DialogTitle>Export workspace</DialogTitle>
            <DialogDescription>
              Bundle every voice, knowledge source, run, document, and campaign
              into a single <code>.opencopy</code> file you can share with
              teammates. API keys and members are not included.
            </DialogDescription>
          </DialogHeader>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={includeEmbeddings}
              onChange={(e) => setIncludeEmbeddings(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
            />
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">Include knowledge embeddings</span>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                Larger file, but knowledge search works immediately on import.
                Uncheck to slim down — the importer can recompute later.
              </span>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={usePassphrase}
              onChange={(e) => setUsePassphrase(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
            />
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-medium">
                <Lock className="h-3.5 w-3.5" /> Encrypt with a passphrase
              </span>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                AES-256-GCM with PBKDF2 key derivation. The same passphrase is
                required to import. The file size and that it is encrypted is
                visible; the workspace name is not.
              </span>
            </div>
          </label>

          {usePassphrase && (
            <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] px-3 py-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="export-passphrase">Passphrase (≥ 8 chars)</Label>
                <Input
                  id="export-passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  minLength={8}
                  required={usePassphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="export-passphrase-confirm">Confirm</Label>
                <Input
                  id="export-passphrase-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  required={usePassphrase}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {confirm.length > 0 && passphrase !== confirm && (
                <p className="flex items-center gap-1.5 text-xs text-[var(--color-destructive)]">
                  <ShieldAlert className="h-3.5 w-3.5" /> Passphrases don&apos;t match.
                </p>
              )}
              <p className="text-xs text-[var(--color-muted-foreground)]">
                There&apos;s no recovery path. Lose the passphrase and the file
                is unrecoverable.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !passphraseValid}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Export
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
