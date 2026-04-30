"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, BookOpen } from "lucide-react";
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
import { createKnowledgeSource } from "@/server/actions/knowledge";

interface Props {
  variant?: "default" | "outline";
}

export function NewSourceDialog({ variant = "default" }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tagsRaw, setTagsRaw] = React.useState("");
  const [content, setContent] = React.useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Give the source a name.");
      return;
    }
    if (content.trim().length < 20) {
      toast.error("Source content is too short — at least 20 characters.");
      return;
    }
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    startTransition(async () => {
      const res = await createKnowledgeSource({
        name: name.trim(),
        description: description.trim() || undefined,
        rawContent: content,
        tags: tags.length > 0 ? tags : undefined,
      });
      if (res.ok && res.id) {
        toast.success("Source indexed.");
        setOpen(false);
        setName("");
        setDescription("");
        setTagsRaw("");
        setContent("");
        router.push(`/knowledge/${res.id}`);
      } else if (res.id) {
        toast.error(res.message ?? "Indexing failed.");
        router.push(`/knowledge/${res.id}`);
      } else {
        toast.error(res.message ?? "Couldn't create source.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus className="h-4 w-4" /> New source
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <BookOpen className="h-5 w-5" />
            </div>
            <DialogTitle>New knowledge source</DialogTitle>
            <DialogDescription>
              Paste the content. We&apos;ll chunk it, embed each chunk with
              OpenAI text-embedding-3-small, and store the vectors in pgvector.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="src-name">Name</Label>
              <Input
                id="src-name"
                autoFocus
                required
                minLength={2}
                maxLength={160}
                placeholder="e.g. Product features (Q3 2026)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="src-tags">Tags (optional, comma-separated)</Label>
              <Input
                id="src-tags"
                placeholder="product, pricing, faq"
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="src-desc">Description (optional)</Label>
            <Input
              id="src-desc"
              placeholder="One-line description of what this source covers."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="src-content">Content</Label>
              <span className="text-[11px] text-[var(--color-muted-foreground)] tabular-nums">
                {content.length.toLocaleString()} chars
              </span>
            </div>
            <Textarea
              id="src-content"
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste product docs, FAQs, brand guidelines, customer interviews, anything you want the agents to know."
              className="min-h-[260px] font-serif"
              style={{ fontFamily: "ui-serif, Georgia, serif" }}
              minLength={20}
              maxLength={500_000}
            />
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              Plain text or markdown. PDF / file uploads land in V1.5.
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
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Index source
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
