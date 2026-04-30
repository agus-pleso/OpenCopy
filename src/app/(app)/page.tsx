import Link from "next/link";
import { ArrowRight, ScanText, Bot, Library, KeyRound, Languages, Sparkles, Check } from "lucide-react";
import { eq, and } from "drizzle-orm";

import { db } from "@/db/client";
import { agentRuns, apiKeys, brandVoices, copyVariants, modelDefaults } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const { workspace } = await getCurrentWorkspace();

  const [openrouter] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.workspaceId, workspace.id),
        eq(apiKeys.provider, "openrouter"),
      ),
    )
    .limit(1);

  const defaults = await db
    .select()
    .from(modelDefaults)
    .where(eq(modelDefaults.workspaceId, workspace.id));

  const voices = await db
    .select({ id: brandVoices.id, status: brandVoices.status })
    .from(brandVoices)
    .where(eq(brandVoices.workspaceId, workspace.id));
  const hasActiveVoice = voices.some((v) => v.status === "active");
  const hasAnyVoice = voices.length > 0;

  const runs = await db
    .select({ id: agentRuns.id, kind: agentRuns.kind })
    .from(agentRuns)
    .where(eq(agentRuns.workspaceId, workspace.id));
  const hasCopywriterRun = runs.some((r) => r.kind === "copywriter");
  const hasLocalizerRun = runs.some((r) => r.kind === "localizer");

  const savedVariants = await db
    .select({ id: copyVariants.id })
    .from(copyVariants)
    .where(
      and(
        eq(copyVariants.workspaceId, workspace.id),
        eq(copyVariants.status, "saved"),
      ),
    );
  const hasSavedVariant = savedVariants.length > 0;

  const checklist = [
    {
      title: "Connect OpenRouter",
      description: "Paste an API key. Use any model from any provider.",
      done: !!openrouter,
      cta: "Open settings",
      href: "/settings/ai",
      icon: KeyRound,
      version: null,
      enabled: true,
    },
    {
      title: "Pick default models",
      description:
        "Choose models for each role: planning, drafting, fast, critic.",
      done: defaults.length >= 4,
      cta: "Configure models",
      href: "/settings/ai",
      icon: Sparkles,
      version: null,
      enabled: !!openrouter,
    },
    {
      title: "Define your first brand voice",
      description:
        "Upload writing samples — the Voice Analyzer extracts a structured profile.",
      done: hasActiveVoice,
      cta: hasAnyVoice ? "Manage voices" : "Create voice",
      href: "/voices",
      icon: ScanText,
      version: null,
      enabled: defaults.length >= 4,
    },
    {
      title: "Run your first copywriter agent",
      description:
        "Multi-agent flow: planner → drafters → voice auditor → refiner.",
      done: hasCopywriterRun || hasSavedVariant,
      cta: hasCopywriterRun ? "Run another" : "Run copywriter",
      href: "/agents/copywriter",
      icon: Bot,
      version: null,
      enabled: hasActiveVoice,
    },
    {
      title: "Localize copy across PL · EN · RO · UA",
      description:
        "Transcreation flow that keeps your brand voice intact across markets.",
      done: hasLocalizerRun,
      cta: hasLocalizerRun ? "Localize again" : "Run localizer",
      href: "/agents/localizer",
      icon: Languages,
      version: null,
      enabled: defaults.length >= 4,
    },
  ];

  const completed = checklist.filter((c) => c.done).length;
  const total = checklist.length;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            {workspace.name}
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
            Welcome to OpenCopy.
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-[var(--color-muted-foreground)]">
            Agentic AI copywriters and localizers, trained on your brand voice.
            Five quick steps to get you generating on-brand copy.
          </p>
        </div>
        <Badge variant="outline" className="hidden md:inline-flex">
          V1.5 · provider polish
        </Badge>
      </div>

      <div className="mt-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-2">
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Get started · {completed}/{total}
          </p>
          <div className="flex h-1.5 w-32 overflow-hidden rounded-full bg-[var(--color-muted)]">
            <div
              className="bg-[var(--color-primary)] transition-all"
              style={{ width: `${(completed / total) * 100}%` }}
            />
          </div>
        </div>
        <ol className="divide-y divide-[var(--color-border)]/60">
          {checklist.map((item, i) => {
            const Icon = item.icon;
            return (
              <li
                key={i}
                className={
                  item.done
                    ? "grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-4 bg-[var(--color-success)]/5"
                    : "grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-4"
                }
              >
                <div
                  className={
                    item.done
                      ? "relative flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-success)] text-white shadow-sm ring-2 ring-[var(--color-success)]/20"
                      : "flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-[var(--color-border)] text-[var(--color-muted-foreground)]"
                  }
                >
                  {item.done ? (
                    <Check className="h-5 w-5 stroke-[3]" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      className={
                        item.done
                          ? "font-medium tracking-tight text-[var(--color-muted-foreground)] line-through decoration-[var(--color-success)]/40 decoration-2"
                          : "font-medium tracking-tight"
                      }
                    >
                      {item.title}
                    </h3>
                    {item.version && (
                      <Badge variant="muted" className="text-[10px] tracking-wider">
                        {item.version}
                      </Badge>
                    )}
                    {item.done && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success)] px-2.5 py-0.5 text-xs font-semibold tracking-wide text-white shadow-sm">
                        <Check className="h-3 w-3 stroke-[3]" /> Completed
                      </span>
                    )}
                  </div>
                  <p
                    className={
                      item.done
                        ? "text-sm text-[var(--color-muted-foreground)]/70 text-pretty"
                        : "text-sm text-[var(--color-muted-foreground)] text-pretty"
                    }
                  >
                    {item.description}
                  </p>
                </div>
                <Button
                  asChild={item.enabled}
                  size="sm"
                  variant={item.done ? "outline" : "default"}
                  disabled={!item.enabled}
                >
                  {item.enabled ? (
                    <Link href={item.href}>
                      {item.cta} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <span>{item.cta}</span>
                  )}
                </Button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Pillar
          icon={ScanText}
          title="Brand voice as the spine"
          body="Every agent reads from a structured voice profile — tone, do's, don'ts, audience, reading level, required and forbidden words."
        />
        <Pillar
          icon={Bot}
          title="Multi-agent transparency"
          body="Planner, drafters, auditor, refiner — every step streams to the timeline. Marketers see why the AI chose what it chose."
        />
        <Pillar
          icon={Library}
          title="You own the stack"
          body="Self-hostable, MIT, Postgres-backed. Plug any model via OpenRouter, direct keys, or local Ollama."
        />
      </div>
    </div>
  );
}

function Pillar({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <Icon className="h-5 w-5 text-[var(--color-primary)]" />
      <h3 className="mt-3 font-display text-base tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm text-[var(--color-muted-foreground)] text-pretty">
        {body}
      </p>
    </div>
  );
}
