"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  extractFromDocument,
  updateVoiceCard,
  type ExtractFromDocumentResult,
} from "@/server/actions/voices";
import type { BrandVoice, Locale, VoiceCardRule } from "@/db/schema";
import type { VoiceCard } from "@/lib/agents/voice-card";

type Phase = "input" | "extracting" | "review";

const LOCALES: Locale[] = ["en", "pl", "ro", "uk"];

interface Props {
  voice: BrandVoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Map of field-key → "is this field accepted in the diff" boolean. The diff UI
 * starts with everything accepted (default behaviour: import all). User can
 * uncheck individual fields to keep their current value for those.
 *
 * Per-locale signature phrase fields are tracked under `signaturePhrases.<lc>`
 * so each locale can be accepted independently.
 */
type FieldKey =
  | "toneDescriptors"
  | "voicePersona"
  | "audience"
  | "readingLevel"
  | "dos"
  | "donts"
  | "requiredWords"
  | "forbiddenWords"
  | "rationale"
  | `signaturePhrases.${Locale}`;

type AcceptMap = Record<FieldKey, boolean>;

function defaultAccept(): AcceptMap {
  const base: Partial<AcceptMap> = {
    toneDescriptors: true,
    voicePersona: true,
    audience: true,
    readingLevel: true,
    dos: true,
    donts: true,
    requiredWords: true,
    forbiddenWords: true,
    rationale: true,
  };
  for (const lc of LOCALES) {
    base[`signaturePhrases.${lc}` as FieldKey] = true;
  }
  return base as AcceptMap;
}

export function DocumentExtractorDialog({ voice, open, onOpenChange }: Props) {
  const [phase, setPhase] = React.useState<Phase>("input");
  const [pastedText, setPastedText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [extracted, setExtracted] = React.useState<VoiceCard | null>(null);
  const [kbHint, setKbHint] = React.useState<{ reason: string } | null>(null);
  const [accept, setAccept] = React.useState<AcceptMap>(defaultAccept);
  const [extracting, startExtract] = useTransition();
  const [saving, startSave] = useTransition();

  // Reset state every time the dialog opens fresh.
  React.useEffect(() => {
    if (open) {
      setPhase("input");
      setPastedText("");
      setFile(null);
      setExtracted(null);
      setKbHint(null);
      setAccept(defaultAccept());
    }
  }, [open]);

  const onExtract = (mode: "paste" | "upload") => {
    startExtract(async () => {
      let res: ExtractFromDocumentResult;
      if (mode === "paste") {
        if (pastedText.trim().length < 80) {
          toast.error(
            "Paste at least a paragraph of substantive ToV content (≥80 chars).",
          );
          return;
        }
        setPhase("extracting");
        res = await extractFromDocument({
          voiceId: voice.id,
          pastedText: pastedText.trim(),
        });
      } else {
        if (!file) {
          toast.error("Pick a file first.");
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast.error("File is too big — max 5 MB.");
          return;
        }
        setPhase("extracting");
        const arrayBuffer = await file.arrayBuffer();
        const contentBase64 = arrayBufferToBase64(arrayBuffer);
        res = await extractFromDocument({
          voiceId: voice.id,
          file: { name: file.name, contentBase64 },
        });
      }
      if (!res.ok || !res.card) {
        toast.error(res.message ?? "Extraction failed.");
        setPhase("input");
        return;
      }
      setExtracted(res.card);
      setKbHint(res.kbHint ?? null);
      setPhase("review");
    });
  };

  const onSave = () => {
    if (!extracted) return;
    startSave(async () => {
      // Compose the partial update from accepted fields only.
      const update: Record<string, unknown> = { voiceId: voice.id };
      if (accept.toneDescriptors) update.toneDescriptors = extracted.tone_descriptors;
      if (accept.voicePersona) update.voicePersona = extracted.voice_persona;
      if (accept.audience) update.audience = extracted.audience;
      if (accept.readingLevel) update.readingLevel = extracted.reading_level;
      if (accept.dos)
        update.dos = extracted.dos.map((d) => ({ rule: d.rule, why: d.why }));
      if (accept.donts)
        update.donts = extracted.donts.map((d) => ({ rule: d.rule, why: d.why }));
      if (accept.requiredWords) update.requiredWords = extracted.required_words;
      if (accept.forbiddenWords)
        update.forbiddenWords = extracted.forbidden_words;
      if (accept.rationale) update.rationale = extracted.rationale;

      // Signature phrases — merge per-locale based on which locales are accepted.
      const sigPatch: Partial<Record<Locale, string[]>> = {};
      let anySig = false;
      for (const lc of LOCALES) {
        if (accept[`signaturePhrases.${lc}` as FieldKey]) {
          sigPatch[lc] = extracted.signature_phrases[lc] ?? [];
          anySig = true;
        }
      }
      if (anySig) update.signaturePhrases = sigPatch;

      try {
        await updateVoiceCard(update);
        toast.success("Voice card updated from document.");
        onOpenChange(false);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't save the changes.",
        );
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import voice from Tone-of-Voice document</DialogTitle>
          <DialogDescription>
            Paste your existing ToV document or upload a .docx, .txt, or .md
            file. The extractor reads it and proposes a voice card —
            you&apos;ll review each field before it&apos;s saved.
          </DialogDescription>
        </DialogHeader>

        {phase === "input" && (
          <Tabs defaultValue="paste">
            <TabsList>
              <TabsTrigger value="paste">
                <FileText className="h-3.5 w-3.5" /> Paste
              </TabsTrigger>
              <TabsTrigger value="upload">
                <Upload className="h-3.5 w-3.5" /> Upload
              </TabsTrigger>
            </TabsList>
            <TabsContent value="paste" className="flex flex-col gap-3">
              <Textarea
                placeholder="Paste the full Tone-of-Voice document here…"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                className="min-h-[280px] font-mono text-xs"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => onExtract("paste")}
                  disabled={extracting || pastedText.trim().length < 80}
                >
                  {extracting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Extract <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="upload" className="flex flex-col gap-3">
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 p-10">
                <Upload className="h-6 w-6 text-[var(--color-muted-foreground)]" />
                <Label htmlFor="docx-file" className="cursor-pointer text-sm">
                  {file ? (
                    <span className="font-mono">{file.name}</span>
                  ) : (
                    <>
                      Choose a file
                      <span className="ml-1 text-[var(--color-muted-foreground)]">
                        (.docx, .txt, .md — max 5 MB)
                      </span>
                    </>
                  )}
                </Label>
                <input
                  id="docx-file"
                  type="file"
                  accept=".docx,.txt,.md,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => onExtract("upload")}
                  disabled={extracting || !file}
                >
                  {extracting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Extract <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {phase === "extracting" && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Reading your document and extracting voice attributes…
            </p>
          </div>
        )}

        {phase === "review" && extracted && (
          <ReviewPane
            voice={voice}
            extracted={extracted}
            kbHint={kbHint}
            accept={accept}
            setAccept={setAccept}
          />
        )}

        {phase === "review" && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPhase("input")}>
              Back
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save accepted fields
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ReviewPaneProps {
  voice: BrandVoice;
  extracted: VoiceCard;
  kbHint: { reason: string } | null;
  accept: AcceptMap;
  setAccept: React.Dispatch<React.SetStateAction<AcceptMap>>;
}

function ReviewPane({
  voice,
  extracted,
  kbHint,
  accept,
  setAccept,
}: ReviewPaneProps) {
  const toggle = (key: FieldKey) =>
    setAccept((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Untick any field you want to keep at its current value. Ticked fields
        are overwritten on save.
      </p>

      <FieldRow
        label="Tone descriptors"
        accepted={accept.toneDescriptors}
        onToggle={() => toggle("toneDescriptors")}
        before={voice.toneDescriptors}
        after={extracted.tone_descriptors}
        renderValue={(v) => v.join(", ") || <Empty />}
      />

      <FieldRow
        label="Persona"
        accepted={accept.voicePersona}
        onToggle={() => toggle("voicePersona")}
        before={voice.voicePersona}
        after={extracted.voice_persona}
        renderValue={(v) => v || <Empty />}
      />

      <FieldRow
        label="Audience"
        accepted={accept.audience}
        onToggle={() => toggle("audience")}
        before={voice.audience}
        after={extracted.audience}
        renderValue={(v) => v || <Empty />}
      />

      <FieldRow
        label="Reading level"
        accepted={accept.readingLevel}
        onToggle={() => toggle("readingLevel")}
        before={voice.readingLevel}
        after={extracted.reading_level}
        renderValue={(v) => v || <Empty />}
      />

      <FieldRow
        label="Do's"
        accepted={accept.dos}
        onToggle={() => toggle("dos")}
        before={voice.dos}
        after={extracted.dos}
        renderValue={(v) => <RuleList rules={v} />}
      />

      <FieldRow
        label="Don'ts"
        accepted={accept.donts}
        onToggle={() => toggle("donts")}
        before={voice.donts}
        after={extracted.donts}
        renderValue={(v) => <RuleList rules={v} />}
      />

      <FieldRow
        label="Required vocabulary"
        accepted={accept.requiredWords}
        onToggle={() => toggle("requiredWords")}
        before={voice.requiredWords}
        after={extracted.required_words}
        renderValue={(v) => v.join(", ") || <Empty />}
      />

      <FieldRow
        label="Forbidden vocabulary"
        accepted={accept.forbiddenWords}
        onToggle={() => toggle("forbiddenWords")}
        before={voice.forbiddenWords}
        after={extracted.forbidden_words}
        renderValue={(v) => v.join(", ") || <Empty />}
      />

      <div className="rounded-lg border border-[var(--color-border)] p-3">
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Signature phrases (locale-tagged)
        </h4>
        <div className="flex flex-col gap-2">
          {LOCALES.map((lc) => {
            const before = voice.signaturePhrases?.[lc] ?? [];
            const after = extracted.signature_phrases[lc] ?? [];
            // Hide locales the extractor didn't find anything for, unless the
            // current voice already has phrases there.
            if (after.length === 0 && before.length === 0) return null;
            const key = `signaturePhrases.${lc}` as FieldKey;
            return (
              <FieldRow
                key={lc}
                label={lc.toUpperCase()}
                accepted={accept[key]}
                onToggle={() => toggle(key)}
                before={before}
                after={after}
                renderValue={(v) => <PhraseList phrases={v} />}
                compact
              />
            );
          })}
        </div>
      </div>

      <FieldRow
        label="Rationale"
        accepted={accept.rationale}
        onToggle={() => toggle("rationale")}
        before={voice.rationale}
        after={extracted.rationale}
        renderValue={(v) => v || <Empty />}
      />

      {kbHint && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/8 p-3 text-xs">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
          <div className="flex-1">
            <p className="font-medium text-[var(--color-foreground)]">
              This document looks like it has KB-worthy content.
            </p>
            <p className="mt-0.5 text-[var(--color-muted-foreground)]">
              {kbHint.reason}
            </p>
            <p className="mt-1.5 text-[var(--color-muted-foreground)]">
              Voice profiles work best when they cover style, not facts.
              Consider sending the factual bits to{" "}
              <strong>Knowledge → New source</strong> separately.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface FieldRowProps<T> {
  label: string;
  accepted: boolean;
  onToggle: () => void;
  before: T;
  after: T;
  renderValue: (v: T) => React.ReactNode;
  compact?: boolean;
}

function FieldRow<T>({
  label,
  accepted,
  onToggle,
  before,
  after,
  renderValue,
  compact,
}: FieldRowProps<T>) {
  return (
    <div
      className={
        compact
          ? "grid grid-cols-[auto_80px_1fr_1fr] items-start gap-3"
          : "grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-[var(--color-border)] p-3"
      }
    >
      <input
        type="checkbox"
        checked={accepted}
        onChange={onToggle}
        className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
        aria-label={`Accept ${label}`}
      />
      {!compact && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {label}
          </h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Current
              </p>
              <div className="text-[var(--color-foreground)]/70">
                {renderValue(before)}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Extracted
              </p>
              <div
                className={
                  accepted ? "text-[var(--color-foreground)]" : "opacity-50"
                }
              >
                {renderValue(after)}
              </div>
            </div>
          </div>
        </div>
      )}
      {compact && (
        <>
          <div className="text-xs font-medium tracking-wider text-[var(--color-muted-foreground)]">
            {label}
          </div>
          <div className="text-xs text-[var(--color-foreground)]/70">
            {renderValue(before)}
          </div>
          <div
            className={
              "text-xs " +
              (accepted ? "text-[var(--color-foreground)]" : "opacity-50")
            }
          >
            {renderValue(after)}
          </div>
        </>
      )}
    </div>
  );
}

function RuleList({ rules }: { rules: VoiceCardRule[] | { rule: string; why?: string }[] }) {
  if (!rules || rules.length === 0) return <Empty />;
  return (
    <ul className="flex flex-col gap-1">
      {rules.slice(0, 5).map((r, i) => (
        <li key={i} className="leading-snug">
          <span className="font-medium">{r.rule}</span>
          {r.why && (
            <span className="text-[var(--color-muted-foreground)]"> — {r.why}</span>
          )}
        </li>
      ))}
      {rules.length > 5 && (
        <li className="text-[var(--color-muted-foreground)]">
          + {rules.length - 5} more
        </li>
      )}
    </ul>
  );
}

function PhraseList({ phrases }: { phrases: string[] }) {
  if (!phrases || phrases.length === 0) return <Empty />;
  return (
    <ul className="flex flex-col gap-0.5">
      {phrases.slice(0, 6).map((p, i) => (
        <li key={i} className="font-mono leading-snug">
          &ldquo;{p}&rdquo;
        </li>
      ))}
      {phrases.length > 6 && (
        <li className="text-[var(--color-muted-foreground)]">
          + {phrases.length - 6} more
        </li>
      )}
    </ul>
  );
}

function Empty() {
  return (
    <span className="inline-flex items-center gap-1 text-[var(--color-muted-foreground)]/60">
      <AlertCircle className="h-3 w-3" /> empty
    </span>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa !== "undefined"
    ? btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
}
