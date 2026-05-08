"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createManualLibraryEntry } from "@/server/actions/library";

const CHANNELS = [
  "ad",
  "email",
  "landing",
  "social",
  "blog",
  "headline",
  "product_description",
  "other",
] as const;
const LOCALES = ["en", "pl", "ro", "uk"] as const;

type Channel = (typeof CHANNELS)[number];
type Locale = (typeof LOCALES)[number];

interface VoiceOption {
  id: string;
  name: string;
}

interface Props {
  voices: VoiceOption[];
}

/**
 * Dialog for creating a hand-curated reference exemplar in the Library.
 * Surfaces from the Library page header. Saved entries are stored as
 * `library_entries` rows with `kind='manual'` and `source='manual'` and
 * are pulled into the copywriter drafter prompt as STYLE references
 * whenever a brief matches their channel + locale + voice scope.
 */
export function ManualLibraryEntryDialog({ voices }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [channel, setChannel] = React.useState<Channel | "none">("none");
  const [locale, setLocale] = React.useState<Locale>("en");
  const [voiceId, setVoiceId] = React.useState<string>("none");
  const [tagInput, setTagInput] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) {
      // Reset on each open so previous draft state doesn't leak.
      setTitle("");
      setContent("");
      setChannel("none");
      setLocale("en");
      setVoiceId("none");
      setTagInput("");
      setTags([]);
    }
  }, [open]);

  const addTag = () => {
    const t = tagInput.trim().slice(0, 40);
    if (!t || tags.includes(t) || tags.length >= 20) return;
    setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const onSave = () => {
    if (content.trim().length < 1) {
      toast.error("Paste the exemplar copy first.");
      return;
    }
    startTransition(async () => {
      try {
        await createManualLibraryEntry({
          content: content.trim(),
          title: title.trim() || undefined,
          voiceId: voiceId === "none" ? null : voiceId,
          channel: channel === "none" ? null : channel,
          locale,
          tags,
        });
        toast.success("Exemplar saved to library.");
        setOpen(false);
        // Trigger a fresh server-render of the library page so the new row
        // shows up immediately. revalidatePath inside the action handles the
        // cache; router.refresh() pulls the new RSC payload.
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't save the entry.",
        );
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4" /> Add manual entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a reference exemplar</DialogTitle>
          <DialogDescription>
            Hand-curated, human-written copy you want the copywriter agent to
            use as a STYLE reference. Different from saving an AI variant —
            these are the gold-standard examples your team has hand-picked.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-title">Title (optional)</Label>
            <Input
              id="manual-title"
              placeholder="e.g. 'Q3 onboarding email — best performer'"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={220}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-content">Content</Label>
            <Textarea
              id="manual-content"
              placeholder="Paste the exemplar copy here…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[200px]"
              maxLength={20000}
            />
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              {content.length} / 20,000 characters
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Channel scope</Label>
              <Select
                value={channel}
                onValueChange={(v) => setChannel(v as Channel | "none")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any channel</SelectItem>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Locale</Label>
              <Select
                value={locale}
                onValueChange={(v) => setLocale(v as Locale)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Brand voice scope</Label>
              <Select value={voiceId} onValueChange={setVoiceId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any voice</SelectItem>
                  {voices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-tags">Tags (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="manual-tags"
                placeholder="Add a tag and press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                maxLength={40}
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} variant="outline" className="pr-1">
                    {t}
                    <button
                      type="button"
                      className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-[var(--color-muted)]"
                      onClick={() => removeTag(t)}
                      aria-label={`Remove ${t}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={pending || content.trim().length < 1}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save exemplar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
