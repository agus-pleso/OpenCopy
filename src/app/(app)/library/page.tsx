import { Library } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function LibraryPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[--color-muted-foreground]">
            Library
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
            Your approved copy, organized.
          </h1>
        </div>
        <Badge variant="muted">V1.0</Badge>
      </div>
      <p className="mt-3 max-w-2xl text-pretty text-[--color-muted-foreground]">
        Every variant you save from a Copywriter or Localizer run lands here —
        searchable, filterable by brand voice, and ready to copy out or hand off.
      </p>

      <div className="mt-12 flex flex-col items-center justify-center rounded-xl border border-dashed border-[--color-border] bg-[--color-muted]/30 px-8 py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[--color-primary]/10 text-[--color-primary]">
          <Library className="h-5 w-5" />
        </div>
        <h2 className="mt-5 font-display text-xl tracking-tight">
          Nothing saved yet
        </h2>
        <p className="mt-2 max-w-sm text-sm text-[--color-muted-foreground] text-pretty">
          The library fills itself as you approve agent outputs. Run your first
          Copywriter agent in V1.0 to see this populate.
        </p>
      </div>
    </div>
  );
}
