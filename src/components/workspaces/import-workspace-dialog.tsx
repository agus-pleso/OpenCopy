"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  FileUp,
  Loader2,
  Lock,
  ShieldAlert,
  Upload,
} from "lucide-react";
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

interface PreviewManifest {
  source: { workspace: { name: string; slug: string; defaultLocale: string } };
  exportedAt: string;
  exporter: { email: string | null };
  tables: Array<{ name: string; rowCount: number }>;
  memberLabels: Array<{ email: string; role: string }>;
  includesEmbeddings: boolean;
  embeddingsModel: string | null;
  embeddingDimensions: number | null;
}

interface Props {
  trigger?: React.ReactNode;
}

export function ImportWorkspaceDialog({ trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"pick" | "preview">("pick");
  const [pending, setPending] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [passphrase, setPassphrase] = React.useState("");
  const [needsPassphrase, setNeedsPassphrase] = React.useState(false);
  const [manifest, setManifest] = React.useState<PreviewManifest | null>(null);

  const reset = () => {
    setStep("pick");
    setFile(null);
    setPassphrase("");
    setNeedsPassphrase(false);
    setManifest(null);
    setPending(false);
  };

  const submitPreview = async () => {
    if (!file) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (passphrase) fd.append("passphrase", passphrase);
      fd.append("mode", "preview");
      const res = await fetch("/api/workspace/import", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => null)) as
        | { manifest: PreviewManifest }
        | { error: string; code?: string }
        | null;
      if (!res.ok) {
        const err = (data ?? { error: `import preview failed (${res.status})` }) as {
          error: string;
          code?: string;
        };
        if (err.code === "ENCRYPTED" || err.code === "BAD_PASSPHRASE") {
          setNeedsPassphrase(true);
          throw new Error(err.error);
        }
        throw new Error(err.error);
      }
      const ok = data as { manifest: PreviewManifest };
      setManifest(ok.manifest);
      setStep("preview");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  const submitCommit = async () => {
    if (!file) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (passphrase) fd.append("passphrase", passphrase);
      fd.append("mode", "commit");
      const res = await fetch("/api/workspace/import", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => null)) as
        | { workspaceId: string }
        | { error: string }
        | null;
      if (!res.ok) {
        const err = (data ?? { error: `import failed (${res.status})` }) as {
          error: string;
        };
        throw new Error(err.error);
      }
      toast.success("Workspace imported. Switching now…");
      setOpen(false);
      reset();
      // Hard refresh — the new workspace is now the user's currentWorkspaceId.
      router.refresh();
      window.location.assign("/");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4" /> Import
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Upload className="h-5 w-5" />
          </div>
          <DialogTitle>Import workspace</DialogTitle>
          <DialogDescription>
            Pick a <code>.opencopy</code> file. We&apos;ll preview what&apos;s
            inside, then create a brand-new workspace where you become the sole
            owner.
          </DialogDescription>
        </DialogHeader>

        {step === "pick" && (
          <div className="flex flex-col gap-4">
            <label className="flex cursor-pointer flex-col gap-2 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-4 py-6 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <FileUp className="h-4 w-4" />
                {file ? file.name : "Choose .opencopy file"}
              </span>
              {file && (
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              )}
              <input
                type="file"
                accept=".opencopy"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setNeedsPassphrase(false);
                }}
              />
            </label>

            {needsPassphrase && (
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="import-passphrase"
                  className="flex items-center gap-1.5"
                >
                  <Lock className="h-3.5 w-3.5" /> Passphrase
                </Label>
                <Input
                  id="import-passphrase"
                  type="password"
                  autoComplete="off"
                  autoFocus
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
                <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                  <ShieldAlert className="h-3.5 w-3.5" /> This file is encrypted.
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
              <Button
                type="button"
                onClick={submitPreview}
                disabled={!file || pending}
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Preview
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && manifest && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-3 text-sm">
              <Database className="mt-0.5 h-4 w-4 text-[var(--color-primary)]" />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {manifest.source.workspace.name}
                </span>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  Locale: {manifest.source.workspace.defaultLocale.toUpperCase()}{" "}
                  · Exported{" "}
                  {new Date(manifest.exportedAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {manifest.exporter.email
                    ? ` by ${manifest.exporter.email}`
                    : ""}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 text-xs">
              {manifest.tables
                .filter((t) => t.rowCount > 0)
                .map((t) => (
                  <div
                    key={t.name}
                    className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5"
                  >
                    <span className="font-mono text-[var(--color-muted-foreground)]">
                      {t.name}
                    </span>
                    <span className="font-medium tabular-nums">
                      {t.rowCount}
                    </span>
                  </div>
                ))}
            </div>

            <p className="text-xs text-[var(--color-muted-foreground)]">
              Embeddings:{" "}
              {manifest.includesEmbeddings ? (
                <>
                  included ({manifest.embeddingsModel} ·{" "}
                  {manifest.embeddingDimensions} dims)
                </>
              ) : (
                "not included — knowledge search will need re-embedding"
              )}
            </p>

            {manifest.memberLabels.length > 0 && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {manifest.memberLabels.length} teammate
                {manifest.memberLabels.length === 1 ? "" : "s"} in the source
                workspace — re-invite from <em>Settings → Members</em> after
                import.
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("pick")}
                disabled={pending}
              >
                Back
              </Button>
              <Button type="button" onClick={submitCommit} disabled={pending}>
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Import as new workspace
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
