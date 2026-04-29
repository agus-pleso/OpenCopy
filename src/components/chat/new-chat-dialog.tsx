"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, MessageSquare } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createChatThread } from "@/server/actions/chat";
import { cn } from "@/lib/utils";
import type { Locale } from "@/db/schema";

interface VoiceOption {
  id: string;
  name: string;
  isAnalyzed: boolean;
}

interface SourceOption {
  id: string;
  name: string;
  status: string;
}

interface Props {
  voices: VoiceOption[];
  sources: SourceOption[];
  variant?: "default" | "outline";
  label?: string;
}

export function NewChatDialog({
  voices,
  sources,
  variant = "default",
  label = "New chat",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = useTransition();
  const [voiceId, setVoiceId] = React.useState<string>("__none");
  const [locale, setLocale] = React.useState<Locale>("en");
  const [selectedSourceIds, setSelectedSourceIds] = React.useState<string[]>([]);

  const usableVoices = voices.filter((v) => v.isAnalyzed);
  const usableSources = sources.filter((s) => s.status === "ready");

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const { id } = await createChatThread({
          voiceId: voiceId !== "__none" ? voiceId : undefined,
          locale,
          sourceIds: selectedSourceIds.length > 0 ? selectedSourceIds : undefined,
        });
        setOpen(false);
        router.push(`/chat/${id}`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus className="h-4 w-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[--color-primary]/10 text-[--color-primary]">
              <MessageSquare className="h-5 w-5" />
            </div>
            <DialogTitle>New chat</DialogTitle>
            <DialogDescription>
              Pick the brand voice and knowledge sources you want grounded into
              every turn. Both can be changed later from inside the thread.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Brand voice</Label>
              <Select value={voiceId} onValueChange={setVoiceId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No voice</SelectItem>
                  {usableVoices.map((v) => (
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

          {usableSources.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>Knowledge sources (optional)</Label>
              <div className="flex flex-wrap gap-1.5">
                {usableSources.map((s) => {
                  const selected = selectedSourceIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSource(s.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition",
                        selected
                          ? "border-[--color-primary]/40 bg-[--color-primary]/10 text-[--color-primary]"
                          : "border-[--color-border] bg-[--color-background] text-[--color-foreground] hover:bg-[--color-accent]",
                      )}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
              Start chat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
