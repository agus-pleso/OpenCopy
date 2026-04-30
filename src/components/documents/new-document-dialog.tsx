"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createDocument } from "@/server/actions/documents";
import type { Locale } from "@/db/schema";

interface VoiceOption {
  id: string;
  name: string;
  isAnalyzed: boolean;
}

interface Props {
  voices: VoiceOption[];
  variant?: "default" | "outline";
}

export function NewDocumentDialog({ voices, variant = "default" }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = React.useState("");
  const [voiceId, setVoiceId] = React.useState<string>("__none");
  const [locale, setLocale] = React.useState<Locale>("en");

  const usable = voices.filter((v) => v.isAnalyzed);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const { id } = await createDocument({
          title: title.trim() || "Untitled",
          voiceId: voiceId !== "__none" ? voiceId : undefined,
          locale,
        });
        setOpen(false);
        setTitle("");
        router.push(`/documents/${id}`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus className="h-4 w-4" /> New document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <FileText className="h-5 w-5" />
            </div>
            <DialogTitle>New document</DialogTitle>
            <DialogDescription>
              Long-form writing with brand-voice-aware AI commands at your cursor.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-title">Title (optional)</Label>
            <Input
              id="doc-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 launch announcement"
              maxLength={220}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Brand voice</Label>
              <Select value={voiceId} onValueChange={setVoiceId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No voice</SelectItem>
                  {usable.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Locale</Label>
              <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="pl">Polski</SelectItem>
                  <SelectItem value="ro">Română</SelectItem>
                  <SelectItem value="uk">Українська</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create document
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
