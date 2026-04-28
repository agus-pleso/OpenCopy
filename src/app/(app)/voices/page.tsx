import { ScanText, Sparkles, BookOpen } from "lucide-react";
import { listVoices } from "@/server/actions/voices";
import { NewVoiceDialog } from "@/components/voices/new-voice-dialog";
import { VoiceListCard } from "@/components/voices/voice-list-card";

export default async function VoicesPage() {
  const voices = await listVoices();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[--color-muted-foreground]">
            Brand voices
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl text-balance">
            The spine of every agent run.
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-[--color-muted-foreground]">
            Upload writing samples — the Voice Analyzer extracts a structured
            profile (tone, do&apos;s, don&apos;ts, audience, vocabulary). Every Copywriter
            and Localizer run reads from the voices you define here.
          </p>
        </div>
        <NewVoiceDialog />
      </div>

      {voices.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {voices.map((v) => (
            <VoiceListCard key={v.id} voice={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-12 grid gap-8 md:grid-cols-[1.2fr,1fr] md:gap-14">
      <div className="rounded-2xl border border-dashed border-[--color-border] bg-[--color-muted]/30 px-8 py-16 text-center md:py-20">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[--color-primary]/10 text-[--color-primary]">
          <ScanText className="h-5 w-5" />
        </div>
        <h2 className="mt-5 font-display text-2xl tracking-tight">
          Define your first brand voice.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-[--color-muted-foreground]">
          Paste 2–5 representative samples of your existing copy. The Voice
          Analyzer reads them and proposes a structured profile in under a minute.
        </p>
        <div className="mt-6 inline-flex">
          <NewVoiceDialog />
        </div>
      </div>
      <div className="grid gap-4">
        <Tip
          icon={ScanText}
          title="Sample-driven, not preference-driven"
          body="Don't write a brief in plain English — drop in real copy. The analyzer extracts what your brand actually does, not what you think it does."
        />
        <Tip
          icon={Sparkles}
          title="Review before shipping"
          body="The proposed voice card is a starting point. Edit any field that doesn't ring true, then mark the voice 'active'."
        />
        <Tip
          icon={BookOpen}
          title="One voice per brand, not per channel"
          body="Add 3–5 samples mixing channels — homepage, ad, email, blog. The auditor handles channel-specific nuances at run time."
        />
      </div>
    </div>
  );
}

function Tip({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-4">
      <Icon className="h-4 w-4 text-[--color-primary]" />
      <h3 className="mt-2 font-display text-base tracking-tight">{title}</h3>
      <p className="mt-1 text-sm text-[--color-muted-foreground] text-pretty">
        {body}
      </p>
    </div>
  );
}
