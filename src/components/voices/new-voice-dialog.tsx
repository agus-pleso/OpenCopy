"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createVoice } from "@/server/actions/voices";
import type { Locale } from "@/db/schema";

export function NewVoiceDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [defaultLocale, setDefaultLocale] = React.useState<Locale>("en");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    startTransition(async () => {
      try {
        const { id } = await createVoice({
          name: name.trim(),
          description: description.trim() || undefined,
          defaultLocale,
        });
        setOpen(false);
        setName("");
        setDescription("");
        toast.success("Voice created. Add samples next.");
        router.push(`/voices/${id}`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New voice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New brand voice</DialogTitle>
            <DialogDescription>
              Give it a name and a brief description. You&apos;ll add writing samples
              next, then run the analyzer to extract the structured profile.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="voice-name">Name</Label>
            <Input
              id="voice-name"
              autoFocus
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g. Acme — D2C playful"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="voice-desc">Description (optional)</Label>
            <Textarea
              id="voice-desc"
              placeholder="A sentence or two of context — what brand, what channel, what audience."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              className="min-h-[80px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Default locale</Label>
            <Select
              value={defaultLocale}
              onValueChange={(v) => setDefaultLocale(v as Locale)}
            >
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
            <p className="text-xs text-[--color-muted-foreground]">
              You can add locale-specific notes later. Voice rules apply across all locales unless overridden.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || name.trim().length < 2}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create voice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
