"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Copy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runVoiceAudit } from "@/server/actions/voices";
import type { Locale } from "@/db/schema";
import type { VoiceAudit, VoiceAuditIssue } from "@/lib/agents";
import { cn } from "@/lib/utils";

const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polski" },
  { value: "ro", label: "Română" },
  { value: "uk", label: "Українська" },
];

const CATEGORY_LABELS: Record<VoiceAuditIssue["category"], string> = {
  tone: "Tone",
  do_violation: "Do violation",
  dont_violation: "Don't violation",
  forbidden_word: "Forbidden word",
  missing_required: "Missing required",
  reading_level: "Reading level",
  audience_mismatch: "Audience mismatch",
  other: "Other",
};

interface Props {
  voiceId: string;
  defaultLocale: Locale;
}

export function AuditPlayground({ voiceId, defaultLocale }: Props) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = React.useState("");
  const [locale, setLocale] = React.useState<Locale>(defaultLocale);
  const [audit, setAudit] = React.useState<VoiceAudit | null>(null);

  const onRun = () => {
    if (draft.trim().length < 20) {
      toast.error("Paste at least 20 characters of draft to audit.");
      return;
    }
    setAudit(null);
    startTransition(async () => {
      const res = await runVoiceAudit({ voiceId, draft, locale });
      if (res.ok && res.audit) {
        setAudit(res.audit);
      } else {
        toast.error(res.message ?? "Audit failed.");
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr,1fr]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.14em] text-[--color-muted-foreground]">
            Draft to audit
          </div>
          <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
            <SelectTrigger className="h-7 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste a draft headline, paragraph, ad copy, or email. The voice auditor will score it and flag every line that drifts off-brand."
          className="min-h-[280px] resize-y font-serif"
          style={{ fontFamily: "ui-serif, Georgia, serif" }}
        />
        <div className="flex items-center justify-between text-xs text-[--color-muted-foreground]">
          <span>{draft.trim().split(/\s+/).filter(Boolean).length} words</span>
          <Button
            size="sm"
            onClick={onRun}
            disabled={pending || draft.trim().length < 20}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Run audit
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-[--color-border] bg-[--color-card] min-h-[400px]">
        <AnimatePresence mode="wait">
          {!audit && !pending && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center px-8 py-16 text-center"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[--color-primary]/10 text-[--color-primary]">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-lg tracking-tight">
                Audit results land here
              </h3>
              <p className="mt-1.5 max-w-sm text-sm text-[--color-muted-foreground] text-pretty">
                Paste a draft and click Run audit. The Voice Auditor scores it
                against your brand voice and flags every line worth a second look.
              </p>
            </motion.div>
          )}
          {pending && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center px-8 py-16 text-center"
            >
              <Loader2 className="h-5 w-5 animate-spin text-[--color-primary]" />
              <p className="mt-4 text-sm text-[--color-muted-foreground]">
                Voice Auditor is reading your draft…
              </p>
            </motion.div>
          )}
          {audit && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="p-6"
            >
              <ScoreHeader score={audit.overall_score} summary={audit.summary} />

              {audit.strengths.length > 0 && (
                <div className="mt-6">
                  <SectionLabel>Strengths</SectionLabel>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {audit.strengths.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-pretty">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[--color-success]" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {audit.issues.length > 0 ? (
                <div className="mt-6">
                  <SectionLabel>
                    {audit.issues.length} issue{audit.issues.length === 1 ? "" : "s"}
                  </SectionLabel>
                  <ul className="mt-2 flex flex-col gap-2.5">
                    {audit.issues
                      .slice()
                      .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
                      .map((issue, i) => (
                        <IssueRow key={i} issue={issue} />
                      ))}
                  </ul>
                </div>
              ) : (
                <div className="mt-6 rounded-md border border-[--color-success]/30 bg-[--color-success]/10 px-4 py-3 text-sm text-[--color-success]">
                  Clean run. No on-brand violations found.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function sevRank(s: VoiceAuditIssue["severity"]): number {
  return s === "high" ? 3 : s === "medium" ? 2 : 1;
}

function ScoreHeader({ score, summary }: { score: number; summary: string }) {
  const tier =
    score >= 90
      ? { label: "Ships clean", tint: "success" as const }
      : score >= 70
      ? { label: "Light edits", tint: "warning" as const }
      : { label: "Needs rewrite", tint: "destructive" as const };

  const tintBg =
    tier.tint === "success"
      ? "bg-[--color-success]"
      : tier.tint === "warning"
      ? "bg-[--color-warning]"
      : "bg-[--color-destructive]";
  const tintFg =
    tier.tint === "success"
      ? "text-[--color-success]"
      : tier.tint === "warning"
      ? "text-[--color-warning]"
      : "text-[--color-destructive]";

  return (
    <div className="flex items-start gap-4">
      <div className="relative">
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="4"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke={
              tier.tint === "success"
                ? "var(--color-success)"
                : tier.tint === "warning"
                ? "var(--color-warning)"
                : "var(--color-destructive)"
            }
            strokeWidth="4"
            strokeDasharray={`${(2 * Math.PI * 28 * score) / 100} ${2 * Math.PI * 28}`}
            strokeDashoffset={2 * Math.PI * 28 * 0.25}
            transform="rotate(-90 32 32)"
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-lg tabular-nums">
          {score}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex h-1.5 w-1.5 rounded-full", tintBg)} />
          <p className={cn("text-xs uppercase tracking-[0.14em]", tintFg)}>
            {tier.label}
          </p>
        </div>
        <p className="mt-1 text-pretty text-sm leading-snug">{summary}</p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-[0.14em] text-[--color-muted-foreground]">
      {children}
    </p>
  );
}

function IssueRow({ issue }: { issue: VoiceAuditIssue }) {
  const [showSuggestion, setShowSuggestion] = React.useState(false);
  const SeverityIcon =
    issue.severity === "high"
      ? XCircle
      : issue.severity === "medium"
      ? AlertCircle
      : AlertTriangle;
  const severityColor =
    issue.severity === "high"
      ? "text-[--color-destructive]"
      : issue.severity === "medium"
      ? "text-[--color-warning]"
      : "text-[--color-muted-foreground]";

  const copySuggestion = () => {
    if (issue.suggestion) {
      navigator.clipboard.writeText(issue.suggestion);
      toast.success("Suggestion copied.");
    }
  };

  return (
    <li className="rounded-md border border-[--color-border] bg-[--color-background] p-3">
      <div className="flex items-start gap-2.5">
        <SeverityIcon className={cn("mt-0.5 h-4 w-4 shrink-0", severityColor)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] tracking-wider">
              {CATEGORY_LABELS[issue.category]}
            </Badge>
            <span className={cn("text-[10px] uppercase tracking-wider", severityColor)}>
              {issue.severity}
            </span>
          </div>
          <blockquote className="mt-2 border-l-2 border-[--color-primary] bg-[--color-muted]/40 px-3 py-1.5 text-sm italic">
            &ldquo;{issue.excerpt}&rdquo;
          </blockquote>
          <p className="mt-2 text-sm text-pretty text-[--color-foreground]">
            {issue.explanation}
          </p>
          {issue.suggestion && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowSuggestion((v) => !v)}
                className="text-xs uppercase tracking-wider text-[--color-primary] hover:underline"
              >
                {showSuggestion ? "Hide" : "Show"} suggestion
              </button>
              {showSuggestion && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-[--color-success]/30 bg-[--color-success]/8 p-2.5 text-sm">
                  <span className="text-pretty">{issue.suggestion}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7 shrink-0"
                    onClick={copySuggestion}
                    aria-label="Copy suggestion"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
