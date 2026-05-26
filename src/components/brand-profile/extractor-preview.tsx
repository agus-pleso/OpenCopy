"use client";

/**
 * extractor-preview — renders the structured proposal the crawler emitted,
 * with inline-edit affordances so the marketer can adjust before applying.
 *
 * For Phase 1C the editable fields are limited to top-level profile metadata
 * (name, tagline, mission, values, locales). Worktree A's extractor agent
 * will progressively unlock voice + audience + positioning editing once it
 * produces those blocks — but the contract here is forward-compatible.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import type { BrandProfileCrawl, Locale } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { applyExtractorProposal } from "@/server/actions/brand-profile";
import { cn } from "@/lib/utils";

const ALL_LOCALES: Locale[] = ["en", "pl", "ro", "uk"];
const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  pl: "Polski",
  ro: "Română",
  uk: "Українська",
};

interface Props {
  crawl: BrandProfileCrawl;
  defaultName: string;
}

export function ExtractorPreview({ crawl, defaultName }: Props) {
  const router = useRouter();
  const [name, setName] = React.useState(defaultName);
  const [tagline, setTagline] = React.useState("");
  const [mission, setMission] = React.useState("");
  const [values, setValues] = React.useState<string[]>([]);
  const [newValue, setNewValue] = React.useState("");
  const [locales, setLocales] = React.useState<Locale[]>(() =>
    crawl.extractedContent?.detectedLocales?.length
      ? Array.from(new Set(crawl.extractedContent.detectedLocales))
      : ["en"],
  );
  const [applying, setApplying] = React.useState(false);

  const onApply = async () => {
    setApplying(true);
    try {
      await applyExtractorProposal({
        crawlId: crawl.id,
        proposalOverrides: {
          name: name.trim(),
          tagline: tagline.trim() || null,
          mission: mission.trim() || null,
          values,
          locales,
        },
      });
      toast.success("Brand profile saved.");
      router.push("/brand-profile");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't apply.");
      setApplying(false);
    }
  };

  const toggleLocale = (l: Locale) => {
    setLocales((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    );
  };

  const pages = crawl.extractedContent?.pages ?? [];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <Section title="Brand basics">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-name">Brand name</Label>
            <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-tagline">Tagline</Label>
            <Input
              id="brand-tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="(optional)"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-mission">Mission</Label>
            <Textarea
              id="brand-mission"
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              placeholder="(optional)"
              className="min-h-[90px]"
            />
          </div>
        </Section>

        <Section title="Brand values">
          <div className="flex flex-wrap gap-1.5">
            {values.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-muted)] px-2.5 py-1 text-xs"
              >
                {v}
                <button
                  type="button"
                  onClick={() => setValues((p) => p.filter((x) => x !== v))}
                  className="rounded-full hover:bg-[var(--color-muted-foreground)]/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = newValue.trim();
              if (trimmed && !values.includes(trimmed)) {
                setValues((p) => [...p, trimmed]);
              }
              setNewValue("");
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Add a value (transparency, craft, …)"
              className="flex-1"
            />
            <Button type="submit" variant="outline" size="sm" disabled={!newValue.trim()}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </form>
        </Section>

        <Section title="Locales">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Which markets do you actually write for?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_LOCALES.map((l) => {
              const active = locales.includes(l);
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => toggleLocale(l)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition",
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)]",
                  )}
                >
                  {LOCALE_LABEL[l]}
                </button>
              );
            })}
          </div>
        </Section>

        <div className="flex justify-end">
          <Button onClick={onApply} disabled={applying || !name.trim() || locales.length === 0} className="gap-1.5">
            {applying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            Apply this profile
          </Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
            <Globe className="h-3.5 w-3.5" /> Extracted from
          </div>
          <p className="mt-1.5 break-words font-mono text-xs">
            {crawl.finalUrl ?? crawl.url}
          </p>
          {pages.length > 0 && (
            <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
              {pages.length} page{pages.length === 1 ? "" : "s"} crawled
            </p>
          )}
          {crawl.jsRendered && (
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              JS rendering enabled
            </p>
          )}
          {pages[0] && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                Preview
              </p>
              <p className="mt-1 text-xs italic leading-relaxed text-pretty text-[var(--color-muted-foreground)]">
                {pages[0].text.slice(0, 280)}
                {pages[0].text.length > 280 ? "…" : ""}
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <h2 className="font-display text-base tracking-tight">{title}</h2>
      {children}
    </div>
  );
}
