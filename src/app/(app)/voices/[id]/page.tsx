import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ScanText,
  Bot,
  Megaphone,
  MessageSquare,
  FileText,
  Library as LibraryIcon,
} from "lucide-react";

import { getVoiceWithSamples, getVoiceUsage } from "@/server/actions/voices";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { VoiceCardSection } from "@/components/voices/voice-card-section";
import { SamplesEditor } from "@/components/voices/samples-editor";
import { AuditPlayground } from "@/components/voices/audit-playground";
import { VoiceStatusActions } from "@/components/voices/voice-status-actions";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const STATUS_VARIANT = {
  active: "success",
  draft: "muted",
  archived: "outline",
} as const;

export default async function VoiceDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  const [voice, usage] = await Promise.all([
    getVoiceWithSamples(id),
    getVoiceUsage(id),
  ]);
  if (!voice) notFound();

  const samples = voice.samples ?? [];
  const hasSamples = samples.length > 0;
  const isAnalyzed = !!voice.analyzedAt;
  const usageTotal =
    usage.runs +
    usage.campaigns +
    usage.threads +
    usage.documents +
    usage.savedVariants;

  const defaultTab = tab
    ? tab
    : !hasSamples
    ? "samples"
    : !isAnalyzed
    ? "card"
    : "card";

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10 md:py-14">
      <Link
        href="/voices"
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition"
      >
        <ChevronLeft className="h-3 w-3" /> All voices
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ScanText className="h-4 w-4 text-[var(--color-primary)]" />
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
              Brand voice
            </p>
            <Badge
              variant={STATUS_VARIANT[voice.status]}
              className="text-[10px] tracking-wider"
            >
              {voice.status}
            </Badge>
          </div>
          <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl text-balance">
            {voice.name}
          </h1>
          {voice.description && (
            <p className="mt-2 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
              {voice.description}
            </p>
          )}
        </div>
        <VoiceStatusActions
          voiceId={voice.id}
          status={voice.status}
          hasAnalysis={isAnalyzed}
        />
      </div>

      {usageTotal > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]/60 px-4 py-3">
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
            Used by
          </span>
          {usage.runs > 0 && (
            <UsageChip
              icon={Bot}
              label={`${usage.runs} run${usage.runs === 1 ? "" : "s"}`}
            />
          )}
          {usage.campaigns > 0 && (
            <UsageChip
              icon={Megaphone}
              label={`${usage.campaigns} campaign${
                usage.campaigns === 1 ? "" : "s"
              }`}
            />
          )}
          {usage.threads > 0 && (
            <UsageChip
              icon={MessageSquare}
              label={`${usage.threads} chat thread${
                usage.threads === 1 ? "" : "s"
              }`}
            />
          )}
          {usage.documents > 0 && (
            <UsageChip
              icon={FileText}
              label={`${usage.documents} document${
                usage.documents === 1 ? "" : "s"
              }`}
            />
          )}
          {usage.savedVariants > 0 && (
            <UsageChip
              icon={LibraryIcon}
              label={`${usage.savedVariants} saved variant${
                usage.savedVariants === 1 ? "" : "s"
              }`}
            />
          )}
        </div>
      )}

      <Tabs defaultValue={defaultTab} className="mt-8">
        <TabsList>
          <TabsTrigger value="card">
            Voice card
            {!isAnalyzed && (
              <span className="ml-2 inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
            )}
          </TabsTrigger>
          <TabsTrigger value="samples">
            Samples
            <span className="ml-2 text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
              {samples.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="audit" disabled={!isAnalyzed}>
            Audit playground
            {!isAnalyzed && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                analyze first
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="card" className="mt-6">
          <VoiceCardSection voice={voice} hasSamples={hasSamples} />

          {isAnalyzed && (
            <div className="mt-6 flex items-center gap-3 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
              <Bot className="h-4 w-4 text-[var(--color-primary)]" />
              <span>
                This voice will plug into Copywriter and Localizer agents in
                V1.0. Activate it once the card reads true.
              </span>
            </div>
          )}
        </TabsContent>

        <TabsContent value="samples" className="mt-6">
          <SamplesEditor voiceId={voice.id} initial={samples} />
        </TabsContent>

        <TabsContent value="audit" className="mt-6">
          {isAnalyzed ? (
            <AuditPlayground
              voiceId={voice.id}
              defaultLocale={voice.defaultLocale}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/40 p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              Run the Voice Analyzer first — the auditor needs a voice card to
              audit against.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsageChip({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-foreground)]/85">
      <Icon className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
      <span className="tabular-nums">{label}</span>
    </span>
  );
}
