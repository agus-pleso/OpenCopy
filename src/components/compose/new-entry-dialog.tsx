"use client";

/**
 * NewEntryDialog — single "+ New" entry point for the four creation surfaces.
 *
 * The dialog asks "What are you making?" and offers four cards:
 *   - Single asset  → Copywriter form (URL-prefilled with voice + sources)
 *   - Campaign      → Campaign /new (URL-prefilled)
 *   - Long-form     → createDocument server action, redirect to /documents/<id>
 *   - Brainstorm    → createChatThread server action, redirect to /chat/<id>
 *
 * Voice + knowledge sources picked in the dialog are pre-attached to the
 * destination via URL params (forms) or server-action input (direct create).
 */

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  FileText,
  Megaphone,
  MessageSquare,
  Plus,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ComposeContextBar,
  type ComposeContextValue,
  type ComposeVoiceOption,
  type ComposeSourceOption,
} from "@/components/compose/compose-context-bar";
import { createDocument } from "@/server/actions/documents";
import { createChatThread } from "@/server/actions/chat";
import { cn } from "@/lib/utils";

interface Props {
  voices: ComposeVoiceOption[];
  sources: ComposeSourceOption[];
  /** Optional custom trigger. Defaults to a "+ New" button. */
  trigger?: React.ReactNode;
}

type Destination = "single" | "campaign" | "longform" | "brainstorm";

interface DestCard {
  id: Destination;
  title: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Visual accent — keeps the four cards distinguishable at a glance. */
  accent: "primary" | "indigo" | "emerald" | "amber";
}

const CARDS: DestCard[] = [
  {
    id: "single",
    title: "Single asset",
    blurb: "Generate one piece of copy — ad, email, headline, social post.",
    icon: Bot,
    accent: "primary",
  },
  {
    id: "campaign",
    title: "Campaign",
    blurb: "Multi-asset orchestration across channels in one run.",
    icon: Megaphone,
    accent: "amber",
  },
  {
    id: "longform",
    title: "Long-form",
    blurb: "A blank document with brand-voice-aware AI commands.",
    icon: FileText,
    accent: "indigo",
  },
  {
    id: "brainstorm",
    title: "Brainstorm",
    blurb: "A chat thread to think through angles and explore ideas.",
    icon: MessageSquare,
    accent: "emerald",
  },
];

const ACCENT_CLASSES: Record<DestCard["accent"], { icon: string; ring: string }> =
  {
    primary: {
      icon: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
      ring: "hover:border-[var(--color-primary)]/50 hover:ring-[var(--color-primary)]/15",
    },
    indigo: {
      icon: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      ring: "hover:border-indigo-500/50 hover:ring-indigo-500/15",
    },
    emerald: {
      icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      ring: "hover:border-emerald-500/50 hover:ring-emerald-500/15",
    },
    amber: {
      icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      ring: "hover:border-amber-500/50 hover:ring-amber-500/15",
    },
  };

export function NewEntryDialog({ voices, sources, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = useTransition();
  const [busyDest, setBusyDest] = React.useState<Destination | null>(null);

  const usableVoices = voices.filter((v) => v.isAnalyzed);
  const [compose, setCompose] = React.useState<ComposeContextValue>({
    voiceId: usableVoices[0]?.id ?? null,
    locale: "en",
    sourceIds: [],
  });

  const buildSearch = (extra: Record<string, string | undefined> = {}) => {
    const params = new URLSearchParams();
    if (compose.voiceId) params.set("voiceId", compose.voiceId);
    if (compose.locale) params.set("locale", compose.locale);
    if (compose.sourceIds.length) params.set("sourceIds", compose.sourceIds.join(","));
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  const go = (dest: Destination) => {
    if (pending) return;
    if (dest === "single") {
      router.push(`/agents/copywriter${buildSearch()}`);
      setOpen(false);
      return;
    }
    if (dest === "campaign") {
      router.push(`/campaigns/new${buildSearch()}`);
      setOpen(false);
      return;
    }
    if (dest === "longform") {
      setBusyDest("longform");
      startTransition(async () => {
        try {
          const { id } = await createDocument({
            title: "Untitled",
            voiceId: compose.voiceId ?? undefined,
            locale: compose.locale,
          });
          setOpen(false);
          router.push(`/documents/${id}`);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusyDest(null);
        }
      });
      return;
    }
    if (dest === "brainstorm") {
      setBusyDest("brainstorm");
      startTransition(async () => {
        try {
          const { id } = await createChatThread({
            voiceId: compose.voiceId ?? undefined,
            locale: compose.locale,
            sourceIds:
              compose.sourceIds.length > 0 ? compose.sourceIds : undefined,
          });
          setOpen(false);
          router.push(`/chat/${id}`);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusyDest(null);
        }
      });
      return;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button data-tour="new-entry">
            <Plus className="h-4 w-4" />
            New
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight">
            What are you making?
          </DialogTitle>
          <DialogDescription>
            Pick a starting point. Voice and knowledge picked here pre-attach
            to wherever you land — you can adjust later.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <ComposeContextBar
            value={compose}
            onChange={setCompose}
            voices={voices}
            sources={sources}
            tourPrefix="new-entry"
          />
        </div>

        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {CARDS.map((card) => {
            const Icon = card.icon;
            const accent = ACCENT_CLASSES[card.accent];
            const busy = busyDest === card.id;
            const dimmed = pending && !busy;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => go(card.id)}
                disabled={pending}
                className={cn(
                  "group relative flex flex-col items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-left transition",
                  "ring-1 ring-transparent",
                  accent.ring,
                  dimmed && "opacity-50",
                  "disabled:cursor-not-allowed",
                )}
                data-tour={`new-entry-${card.id}`}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    accent.icon,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-display text-base tracking-tight">
                  {card.title}
                </span>
                <span className="text-[13px] leading-snug text-[var(--color-muted-foreground)] text-pretty">
                  {card.blurb}
                </span>
                <span className="absolute right-3 top-3 text-[var(--color-muted-foreground)] opacity-0 transition group-hover:opacity-100">
                  {busy ? (
                    <span className="text-xs font-medium">Creating…</span>
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
