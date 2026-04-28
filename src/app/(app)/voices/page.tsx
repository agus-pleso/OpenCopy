import Link from "next/link";
import { ScanText, Sparkles, Wand2, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function VoicesPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[--color-muted-foreground]">
            Brand voices
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
            The spine of every agent run.
          </h1>
        </div>
        <Badge variant="muted">V0.2</Badge>
      </div>
      <p className="mt-3 max-w-2xl text-pretty text-[--color-muted-foreground]">
        Upload writing samples — the Voice Analyzer agent extracts a structured
        profile (tone descriptors, do&apos;s, don&apos;ts, audience, reading level,
        required and forbidden words). Every Copywriter and Localizer run reads
        from this.
      </p>

      <div className="mt-12 grid gap-3 md:grid-cols-3">
        <PreviewCard
          icon={ScanText}
          title="Analyze"
          body="Paste samples or upload .txt / .md / .docx. Get a structured voice card in under a minute."
        />
        <PreviewCard
          icon={Sparkles}
          title="Audit"
          body="Score any draft against the voice. Inline highlights show every off-brand line."
        />
        <PreviewCard
          icon={Wand2}
          title="Apply"
          body="Inject the voice into Copywriter and Localizer agents — automatically and per-locale."
        />
      </div>

      <div className="mt-10 flex items-center gap-3 rounded-lg border border-dashed border-[--color-border] bg-[--color-muted]/40 px-5 py-4 text-sm text-[--color-muted-foreground]">
        <span className="flex h-2 w-2 rounded-full bg-[--color-primary] animate-pulse" />
        <span>Brand voices ship in V0.2 — finish setup to be ready.</span>
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link href="/settings/ai">
            Configure AI <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function PreviewCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-5">
      <Icon className="h-5 w-5 text-[--color-primary]" />
      <h3 className="mt-3 font-display text-base tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm text-[--color-muted-foreground] text-pretty">
        {body}
      </p>
    </div>
  );
}
