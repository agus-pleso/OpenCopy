"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { updateVoiceCard } from "@/server/actions/voices";
import type { BrandVoice, VoiceCardLocaleNotes, VoiceCardRule } from "@/db/schema";

interface Props {
  voice: BrandVoice;
  onCancel: () => void;
  onSaved: () => void;
}

export function VoiceCardEditor({ voice, onCancel, onSaved }: Props) {
  const [pending, startTransition] = useTransition();
  const [tones, setTones] = React.useState<string[]>(voice.toneDescriptors);
  const [persona, setPersona] = React.useState(voice.voicePersona ?? "");
  const [audience, setAudience] = React.useState(voice.audience ?? "");
  const [readingLevel, setReadingLevel] = React.useState(voice.readingLevel ?? "");
  const [dos, setDos] = React.useState<VoiceCardRule[]>(voice.dos);
  const [donts, setDonts] = React.useState<VoiceCardRule[]>(voice.donts);
  const [required, setRequired] = React.useState<string[]>(voice.requiredWords);
  const [forbidden, setForbidden] = React.useState<string[]>(voice.forbiddenWords);
  const [rationale, setRationale] = React.useState(voice.rationale ?? "");
  const [localeNotes, setLocaleNotes] = React.useState<VoiceCardLocaleNotes>(
    voice.localeNotes,
  );

  const onSave = () => {
    startTransition(async () => {
      try {
        await updateVoiceCard({
          voiceId: voice.id,
          toneDescriptors: tones.filter((t) => t.trim()),
          voicePersona: persona.trim() || null,
          audience: audience.trim() || null,
          readingLevel: readingLevel.trim() || null,
          dos: dos.filter((d) => d.rule.trim()),
          donts: donts.filter((d) => d.rule.trim()),
          requiredWords: required.filter((w) => w.trim()),
          forbiddenWords: forbidden.filter((w) => w.trim()),
          rationale: rationale.trim() || null,
          localeNotes,
          setActive: voice.status === "draft",
        });
        toast.success("Voice card saved.");
        onSaved();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-7 py-7 md:px-9 md:py-8">
      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Persona">
          <Textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="The implied speaker — role, expertise, posture."
            className="min-h-[90px]"
          />
        </Field>
        <Field label="Audience">
          <Textarea
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="Who this is written for — role, sophistication, goals."
            className="min-h-[90px]"
          />
        </Field>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Reading level">
          <Input
            value={readingLevel}
            onChange={(e) => setReadingLevel(e.target.value)}
            placeholder="e.g. 8th grade, professional, expert"
          />
        </Field>
        <Field label={`Tone descriptors (${tones.length})`}>
          <ChipsInput
            values={tones}
            onChange={setTones}
            placeholder="Add a tone — confident, wry, plainspoken…"
            max={15}
          />
        </Field>
      </div>

      <Separator className="my-7" />

      <div className="grid gap-7 md:grid-cols-2">
        <RuleListEditor
          label="Do"
          rules={dos}
          onChange={setDos}
          placeholder="Lead with the problem."
        />
        <RuleListEditor
          label="Don't"
          rules={donts}
          onChange={setDonts}
          placeholder="Use the word 'delve'."
        />
      </div>

      <Separator className="my-7" />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={`Required vocabulary (${required.length})`}>
          <ChipsInput
            values={required}
            onChange={setRequired}
            placeholder="Add a required word…"
            max={30}
            tone="success"
          />
        </Field>
        <Field label={`Forbidden vocabulary (${forbidden.length})`}>
          <ChipsInput
            values={forbidden}
            onChange={setForbidden}
            placeholder="Add a forbidden word…"
            max={30}
            tone="destructive"
          />
        </Field>
      </div>

      <Separator className="my-7" />

      <div className="grid gap-4">
        <Field label="Rationale">
          <Textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="2–4 sentences explaining the voice characterization."
            className="min-h-[100px]"
          />
        </Field>
        <Field label="Locale notes (optional)">
          <div className="grid gap-2 md:grid-cols-2">
            {(["en", "pl", "ro", "uk"] as const).map((loc) => (
              <div key={loc} className="flex flex-col gap-1.5">
                <span className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {loc.toUpperCase()}
                </span>
                <Textarea
                  value={localeNotes[loc] ?? ""}
                  onChange={(e) =>
                    setLocaleNotes((prev) => ({ ...prev, [loc]: e.target.value }))
                  }
                  placeholder={`Notes specific to ${loc.toUpperCase()}…`}
                  className="min-h-[60px]"
                />
              </div>
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-7 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={pending}>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save voice card
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ChipsInput({
  values,
  onChange,
  placeholder,
  max,
  tone = "neutral",
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max: number;
  tone?: "neutral" | "success" | "destructive";
}) {
  const [draft, setDraft] = React.useState("");
  const tint =
    tone === "success"
      ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]"
      : tone === "destructive"
      ? "border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 text-[var(--color-destructive)] line-through decoration-1"
      : "border-[var(--color-border)] bg-[var(--color-muted)]";

  const commit = () => {
    const v = draft.trim();
    if (!v || values.length >= max || values.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5 rounded-md border border-[var(--color-input)] bg-[var(--color-background)] p-2 min-h-[44px]">
        {values.map((v, i) => (
          <span
            key={v + i}
            className={`group inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-mono ${tint}`}
          >
            <span>{v}</span>
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="opacity-50 hover:opacity-100"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={values.length === 0 ? placeholder : ""}
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-foreground)]"
        />
      </div>
      <p className="text-[11px] text-[var(--color-muted-foreground)]">
        Press Enter or comma to add. {values.length}/{max}
      </p>
    </div>
  );
}

function RuleListEditor({
  label,
  rules,
  onChange,
  placeholder,
}: {
  label: string;
  rules: VoiceCardRule[];
  onChange: (next: VoiceCardRule[]) => void;
  placeholder: string;
}) {
  const update = (idx: number, patch: Partial<VoiceCardRule>) => {
    onChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const add = () => onChange([...rules, { rule: "", why: "" }]);
  const remove = (idx: number) => onChange(rules.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          {label} ({rules.length})
        </Label>
        <Button variant="ghost" size="sm" onClick={add} className="h-7">
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {rules.map((r, i) => (
          <div
            key={i}
            className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-2"
          >
            <span className="select-none pt-1.5 px-1 text-xs font-mono text-[var(--color-muted-foreground)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex-1 flex flex-col gap-1">
              <Input
                value={r.rule}
                onChange={(e) => update(i, { rule: e.target.value })}
                placeholder={placeholder}
                className="h-8 border-none bg-transparent shadow-none focus-visible:bg-[var(--color-muted)]"
              />
              <Input
                value={r.why ?? ""}
                onChange={(e) => update(i, { why: e.target.value })}
                placeholder="Why (optional, helps the auditor)"
                className="h-7 border-none bg-transparent text-xs text-[var(--color-muted-foreground)] shadow-none focus-visible:bg-[var(--color-muted)]"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
              onClick={() => remove(i)}
              aria-label="Remove rule"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {rules.length === 0 && (
          <p className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-xs text-[var(--color-muted-foreground)]">
            No rules yet. The analyzer will populate this — or click Add.
          </p>
        )}
      </div>
    </div>
  );
}
