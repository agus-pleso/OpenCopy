import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ScanText,
  Users,
  Swords,
  Target,
  BookOpenText,
  History,
  MessageSquare,
} from "lucide-react";

import { getBrandProfile } from "@/server/actions/brand-profile";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { VoiceCardPreview } from "@/components/brand-profile/voice-card-preview";
import { AudienceCard } from "@/components/brand-profile/audience-card";
import { CompetitorCard } from "@/components/brand-profile/competitor-card";
import { NlCommandInline } from "@/components/brand-profile/nl-command-inline";
import type { BrandProfileAudience, Locale } from "@/db/schema";

const LOCALE_LABEL: Record<Locale, string> = {
  en: "EN",
  pl: "PL",
  ro: "RO",
  uk: "UK",
};

interface PageProps {
  searchParams: Promise<{ locale?: string }>;
}

export default async function BrandProfilePage({ searchParams }: PageProps) {
  const profile = await getBrandProfile();

  if (!profile) {
    // No profile yet — push them into onboarding instead of rendering an
    // empty page. The dashboard redirect should usually catch this, but the
    // direct URL hit is possible.
    redirect("/onboarding");
  }

  const { locale: localeParam } = await searchParams;
  const locales = profile.locales.length > 0 ? profile.locales : (["en"] as Locale[]);
  const activeLocale: Locale = (
    localeParam && locales.includes(localeParam as Locale)
      ? (localeParam as Locale)
      : locales[0]
  );

  const allAudiences = profile.audiences;
  const competitors = profile.competitors;
  const knowledge = profile.knowledge;
  const positioning = profile.positioning;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            <ScanText className="h-3.5 w-3.5 text-[var(--color-primary)]" />
            Brand profile
          </div>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
            {profile.name}
          </h1>
          {profile.tagline && (
            <p className="mt-2 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
              {profile.tagline}
            </p>
          )}
          {profile.mission && (
            <p className="mt-3 max-w-3xl text-pretty text-sm text-[var(--color-foreground)]/85">
              {profile.mission}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/brand-profile/revisions">
              <History className="h-3.5 w-3.5" /> History
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings/brand-profile">Settings</Link>
          </Button>
        </div>
      </div>

      {/* Values strip */}
      {profile.values.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {profile.values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 px-3 py-1 text-xs font-medium text-[var(--color-primary)]"
            >
              {v}
            </span>
          ))}
        </div>
      )}

      {/* Inline NL command */}
      <NlCommandInline className="mt-8" />

      {/* Voice — per-locale tabs */}
      <Section
        icon={ScanText}
        title="Voice"
        subtitle="How you sound, per locale."
      >
        {locales.length > 1 ? (
          <Tabs defaultValue={activeLocale}>
            <TabsList>
              {locales.map((l) => (
                <TabsTrigger key={l} value={l}>
                  {LOCALE_LABEL[l]}
                </TabsTrigger>
              ))}
            </TabsList>
            {locales.map((l) => {
              const v = profile.voice[l];
              return (
                <TabsContent key={l} value={l} className="mt-4">
                  {v ? (
                    <VoiceCardPreview locale={l} variant={v} />
                  ) : (
                    <VoiceCardPreview
                      locale={l}
                      variant={EMPTY_VARIANT}
                      empty
                    />
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        ) : (
          <>
            {(() => {
              const l = locales[0];
              const v = profile.voice[l];
              return v ? (
                <VoiceCardPreview locale={l} variant={v} />
              ) : (
                <VoiceCardPreview locale={l} variant={EMPTY_VARIANT} empty />
              );
            })()}
          </>
        )}
      </Section>

      {/* Audiences — per-locale */}
      <Section
        icon={Users}
        title="Audiences"
        subtitle="Who you write for."
      >
        {locales.length > 1 ? (
          <Tabs defaultValue={activeLocale}>
            <TabsList>
              {locales.map((l) => (
                <TabsTrigger key={l} value={l}>
                  {LOCALE_LABEL[l]}
                </TabsTrigger>
              ))}
            </TabsList>
            {locales.map((l) => {
              const list = allAudiences[l] ?? [];
              return (
                <TabsContent key={l} value={l} className="mt-4">
                  <AudienceGrid audiences={list} />
                </TabsContent>
              );
            })}
          </Tabs>
        ) : (
          <AudienceGrid audiences={allAudiences[locales[0]] ?? []} />
        )}
      </Section>

      {/* Positioning */}
      <Section
        icon={Target}
        title="Positioning"
        subtitle="How you differ."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <PositioningPanel label="Differentiators" items={positioning.differentiators} />
          <PositioningPanel label="Brand values" items={positioning.brandValues} />
          <PositioningPanel label="What we stand for" items={positioning.standsFor} />
          <PositioningPanel label="What we stand against" items={positioning.standsAgainst} />
        </div>
      </Section>

      {/* Competitors */}
      <Section
        icon={Swords}
        title="Competitors"
        subtitle={`${competitors.length} mapped.`}
      >
        {competitors.length === 0 ? (
          <EmptyState
            icon={Swords}
            message="No competitors yet."
            cta="Add one with the brand command above — try 'add a competitor: BetterHelp'."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {competitors.map((c) => (
              <CompetitorCard key={c.id} competitor={c} />
            ))}
          </div>
        )}
      </Section>

      {/* Knowledge */}
      <Section
        icon={BookOpenText}
        title="Product knowledge"
        subtitle="Facts your agents lean on."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <KnowledgeCard
            label="Offerings"
            count={knowledge.offerings.length}
            items={knowledge.offerings.map((o) => o.name)}
          />
          <KnowledgeCard
            label="Facts"
            count={knowledge.facts.length}
            items={knowledge.facts.map((f) => f.fact)}
          />
          <KnowledgeCard
            label="FAQs"
            count={knowledge.faqs.length}
            items={knowledge.faqs.map((f) => f.question)}
          />
        </div>
      </Section>

      <div className="mt-10 flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <p className="text-sm">
            Want to refine this? Start a deep-dive chat from{" "}
            <Link
              href="/settings/brand-profile"
              className="text-[var(--color-primary)] underline-offset-2 hover:underline"
            >
              Settings → Brand profile
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

const EMPTY_VARIANT = {
  toneDescriptors: [],
  voicePersona: "",
  audience: "",
  readingLevel: "",
  formality: 5,
  emotionalRegister: "",
  dos: [],
  donts: [],
  vocabularyPreferences: [],
  requiredWords: [],
  forbiddenWords: [],
  samplePieces: [],
  fromSampleAnalysis: false,
};

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[var(--color-primary)]" />
          <h2 className="font-display text-xl tracking-tight md:text-2xl">{title}</h2>
        </div>
        {subtitle && (
          <p className="text-xs text-[var(--color-muted-foreground)]">{subtitle}</p>
        )}
      </header>
      {children}
    </section>
  );
}

function PositioningPanel({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">—</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {items.map((it, i) => (
            <li key={i} className="text-pretty leading-snug">
              <span className="mr-1.5 text-[var(--color-muted-foreground)]">•</span>
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AudienceGrid({ audiences }: { audiences: BrandProfileAudience[] }) {
  if (audiences.length === 0) {
    return (
      <EmptyState
        icon={Users}
        message="No audience captured for this locale."
        cta="Add one with the brand command — try 'add audience: Solo founders'."
      />
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {audiences.map((a) => (
        <AudienceCard key={a.id} audience={a} />
      ))}
    </div>
  );
}

function KnowledgeCard({
  label,
  count,
  items,
}: {
  label: string;
  count: number;
  items: string[];
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
          {label}
        </p>
        <span className="font-mono text-xs tabular-nums text-[var(--color-muted-foreground)]">
          {count}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
          Nothing here yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-1 text-xs leading-snug">
          {items.slice(0, 5).map((it, i) => (
            <li key={i} className="text-pretty">
              <span className="mr-1.5 text-[var(--color-muted-foreground)]">•</span>
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  message,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  message: string;
  cta?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)]/40 px-6 py-10 text-center">
      <Icon className="mx-auto h-5 w-5 text-[var(--color-muted-foreground)]" />
      <p className="mt-3 text-sm font-medium tracking-tight">{message}</p>
      {cta && (
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{cta}</p>
      )}
    </div>
  );
}
