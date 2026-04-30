import Link from "next/link";
import { Library, Bot, Languages } from "lucide-react";
import { listLibraryVariants } from "@/server/actions/agents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LibraryCopyButton } from "@/components/library/library-copy-button";
import { formatDistanceShort } from "@/lib/utils";
import type {
  CopywriterBrief,
  LocalizerBrief,
} from "@/db/schema";

const LOCALE_LABEL: Record<string, string> = {
  en: "EN",
  pl: "PL",
  ro: "RO",
  uk: "UA",
};

export default async function LibraryPage() {
  const variants = await listLibraryVariants({ status: "saved" });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Library
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
            Approved copy, organized.
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
            Every variant you saved from a Copywriter or Localizer run lands
            here — searchable, copyable, traceable back to its run and brand voice.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/agents">Run a new agent</Link>
        </Button>
      </div>

      {variants.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-10 grid gap-4">
          {variants.map((v) => {
            const isLocalizer = v.run?.kind === "localizer";
            const brief = v.run?.brief as
              | CopywriterBrief
              | LocalizerBrief
              | undefined;
            const headline = isLocalizer
              ? `${
                  brief && "sourceLocale" in brief
                    ? brief.sourceLocale.toUpperCase()
                    : ""
                } → ${LOCALE_LABEL[v.locale] ?? v.locale.toUpperCase()}`
              : v.label ?? "Variant";
            return (
              <article
                key={v.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
              >
                <header className="flex items-center gap-3">
                  {isLocalizer ? (
                    <Languages className="h-4 w-4 text-[var(--color-primary)]" />
                  ) : (
                    <Bot className="h-4 w-4 text-[var(--color-primary)]" />
                  )}
                  <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    {isLocalizer ? "Localizer" : "Copywriter"}
                  </span>
                  <h3 className="font-display text-base tracking-tight line-clamp-1">
                    {headline}
                  </h3>
                  <div className="ml-auto flex items-center gap-1.5">
                    {v.voice && (
                      <Badge variant="outline" className="text-[10px] tracking-wider">
                        {v.voice.name}
                      </Badge>
                    )}
                    <Badge variant="muted" className="text-[10px] tracking-wider">
                      {LOCALE_LABEL[v.locale] ?? v.locale.toUpperCase()}
                    </Badge>
                    {v.auditScore != null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success)]/12 px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--color-success)]">
                        <span className="font-mono">{v.auditScore}</span>
                      </span>
                    )}
                  </div>
                </header>
                <p
                  className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-pretty line-clamp-4"
                  style={{ fontFamily: "ui-serif, Georgia, serif" }}
                >
                  {v.refinedContent ?? v.content}
                </p>
                <footer className="mt-3 flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
                  <span>Saved {formatDistanceShort(v.savedAt ?? v.createdAt)}</span>
                  <Link
                    href={`/agents/runs/${v.runId}`}
                    className="hover:text-[var(--color-foreground)] underline-offset-2 hover:underline"
                  >
                    View run
                  </Link>
                  <LibraryCopyButton
                    content={v.refinedContent ?? v.content}
                  />
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-12 flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-8 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
        <Library className="h-5 w-5" />
      </div>
      <h2 className="mt-5 font-display text-xl tracking-tight">
        Nothing saved yet
      </h2>
      <p className="mt-2 max-w-sm text-sm text-[var(--color-muted-foreground)] text-pretty">
        Run a Copywriter or Localizer agent and click <em>Save to library</em>{" "}
        on the variants you like.
      </p>
      <div className="mt-5 flex items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/agents/copywriter">
            <Bot className="h-3.5 w-3.5" /> Copywriter
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/agents/localizer">
            <Languages className="h-3.5 w-3.5" /> Localizer
          </Link>
        </Button>
      </div>
    </div>
  );
}
