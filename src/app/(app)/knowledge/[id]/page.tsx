import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, BookOpen, FileText, AlertTriangle } from "lucide-react";

import { getKnowledgeSource } from "@/server/actions/knowledge";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SourceActions } from "@/components/knowledge/source-actions";
import { SourceContentEditor } from "@/components/knowledge/source-content-editor";

const STATUS_VARIANT = {
  ready: "success",
  indexing: "warning",
  failed: "destructive",
  archived: "outline",
} as const;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function KnowledgeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const source = await getKnowledgeSource(id);
  if (!source) notFound();

  const chunks = source.chunks ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10 md:py-14">
      <Link
        href="/knowledge"
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition"
      >
        <ChevronLeft className="h-3 w-3" /> Knowledge
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--color-primary)]" />
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Knowledge source
            </p>
            <Badge
              variant={STATUS_VARIANT[source.status]}
              className="text-[10px] tracking-wider"
            >
              {source.status}
            </Badge>
          </div>
          <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl text-balance">
            {source.name}
          </h1>
          {source.description && (
            <p className="mt-2 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
              {source.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
            <span className="tabular-nums">
              <FileText className="mr-1 inline h-3 w-3" />
              {source.chunkCount} chunk{source.chunkCount === 1 ? "" : "s"}
            </span>
            <span className="tabular-nums">
              {source.tokenCount.toLocaleString()} tokens
            </span>
            {source.embeddingModel && (
              <span className="font-mono">{source.embeddingModel}</span>
            )}
            {source.indexedAt && (
              <span>
                Indexed{" "}
                {new Date(source.indexedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            )}
          </div>
          {source.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {source.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-0.5 text-[11px] font-medium tracking-tight"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <SourceActions sourceId={source.id} />
      </div>

      {source.status === "failed" && source.error && (
        <div className="mt-6 flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 px-4 py-3 text-sm text-[var(--color-destructive)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Indexing failed</p>
            <p className="mt-1 font-mono text-[12px]">{source.error}</p>
          </div>
        </div>
      )}

      <Tabs defaultValue="content" className="mt-8">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="chunks">
            Chunks
            <span className="ml-2 text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
              {source.chunkCount}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="mt-6">
          <SourceContentEditor
            sourceId={source.id}
            initialContent={source.rawContent}
          />
        </TabsContent>

        <TabsContent value="chunks" className="mt-6">
          {chunks.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 p-6 text-center text-sm text-[var(--color-muted-foreground)]">
              {source.status === "indexing"
                ? "Chunks are being generated. Refresh in a moment."
                : "No chunks yet."}
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {chunks.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
                >
                  <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                    <span className="font-mono">
                      {String(c.seq + 1).padStart(2, "0")}
                    </span>
                    <span>·</span>
                    <span className="tabular-nums">
                      {c.tokenCount.toLocaleString()} tokens
                    </span>
                  </div>
                  <p
                    className="whitespace-pre-wrap text-[14px] leading-relaxed text-pretty"
                    style={{ fontFamily: "ui-serif, Georgia, serif" }}
                  >
                    {c.content}
                  </p>
                </li>
              ))}
              {source.chunkCount > chunks.length && (
                <p className="text-center text-xs text-[var(--color-muted-foreground)]">
                  Showing first {chunks.length} of {source.chunkCount} chunks.
                </p>
              )}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
