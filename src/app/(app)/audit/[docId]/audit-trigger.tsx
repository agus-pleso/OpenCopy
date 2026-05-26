"use client";

/**
 * AuditTrigger — the "Run SEO audit" form.
 *
 * Marketer either provides a primary keyword + secondary keyword chips, or
 * leaves both blank to let the agent infer them. The form is consciously
 * small — three controls — to fit the empty state and the re-run rail.
 *
 * The submit flows into `runSeoAudit` (server action) which currently STUBs
 * the agent call. Phase 2 makes the server-side call take ~8-15s; the form
 * already shows the right "Auditing…" UI for that wait.
 */

import * as React from "react";
import { useTransition } from "react";
import { Sparkles, Loader2, X, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runSeoAudit } from "@/server/actions/audit-seo";
import { isRedirectError } from "@/lib/utils";

interface Props {
  docId: string;
  /** When true (the empty-state path), render the form expanded and emphatic.
   *  When false (the "re-run" rail), render it compact. */
  compact?: boolean;
}

export function AuditTrigger({ docId, compact = false }: Props) {
  const [primaryKeyword, setPrimaryKeyword] = React.useState("");
  const [secondaryKeywords, setSecondaryKeywords] = React.useState<string[]>(
    [],
  );
  const [pendingTag, setPendingTag] = React.useState("");
  const [pending, startTransition] = useTransition();

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (tag.length > 80) {
      toast.error("Keywords cap at 80 characters.");
      return;
    }
    if (secondaryKeywords.includes(tag)) return;
    if (secondaryKeywords.length >= 20) {
      toast.error("Up to 20 secondary keywords.");
      return;
    }
    setSecondaryKeywords((prev) => [...prev, tag]);
    setPendingTag("");
  };

  const onTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(pendingTag);
    } else if (e.key === "Backspace" && pendingTag === "" && secondaryKeywords.length > 0) {
      setSecondaryKeywords((prev) => prev.slice(0, -1));
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    startTransition(async () => {
      try {
        // Drain the in-progress tag into the array first.
        const trailing = pendingTag.trim();
        const finalSecondary = trailing
          ? [...secondaryKeywords, trailing].slice(0, 20)
          : secondaryKeywords;
        await runSeoAudit({
          docId,
          primaryKeyword: primaryKeyword.trim() || undefined,
          secondaryKeywords: finalSecondary,
          inferKeyword: primaryKeyword.trim().length === 0,
        });
        toast.success("Audit complete.");
        // revalidatePath inside the action re-renders the server page.
      } catch (err) {
        if (isRedirectError(err)) throw err;
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className={
        compact
          ? "flex flex-col gap-3"
          : "flex flex-col gap-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-sm md:p-8"
      }
    >
      {!compact && (
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg tracking-tight">
              Run an SEO audit
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)] text-pretty">
              We&apos;ll score this draft on seven axes and surface concrete
              rewrites. Leave the keyword blank to let us infer it from the
              copy.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
            Primary keyword
          </label>
          <Input
            value={primaryKeyword}
            onChange={(e) => setPrimaryKeyword(e.target.value)}
            placeholder="leave blank to let AI infer"
            className="font-mono text-sm"
            maxLength={200}
            disabled={pending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
            Secondary keywords
          </label>
          <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-2 py-1.5 text-sm shadow-sm focus-within:ring-2 focus-within:ring-[var(--color-ring)] focus-within:ring-offset-1">
            {secondaryKeywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-xs font-mono text-[var(--color-primary)]"
              >
                {kw}
                <button
                  type="button"
                  onClick={() =>
                    setSecondaryKeywords((prev) =>
                      prev.filter((k) => k !== kw),
                    )
                  }
                  className="rounded-sm opacity-70 hover:opacity-100"
                  aria-label={`Remove ${kw}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              value={pendingTag}
              onChange={(e) => setPendingTag(e.target.value)}
              onKeyDown={onTagKey}
              placeholder={
                secondaryKeywords.length === 0
                  ? "type and press Enter"
                  : "add another"
              }
              className="min-w-[80px] flex-1 bg-transparent text-sm font-mono outline-none placeholder:text-[var(--color-muted-foreground)]"
              disabled={pending}
            />
            {pendingTag.trim().length > 0 && (
              <button
                type="button"
                onClick={() => addTag(pendingTag)}
                className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                aria-label="Add keyword"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {pending
            ? "The auditor is reading the SERP and scoring your draft. This can take a few seconds."
            : "Audits cache their SERP fetches for 24 hours."}
        </p>
        <Button type="submit" disabled={pending} size={compact ? "sm" : "default"}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {pending ? "Auditing…" : "Run SEO audit"}
        </Button>
      </div>
    </form>
  );
}
