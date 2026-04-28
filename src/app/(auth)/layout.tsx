import Link from "next/link";
import { Logo } from "@/components/marketing/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh grid lg:grid-cols-[1fr,1.1fr]">
      <div className="flex flex-col px-6 py-8 lg:px-12 lg:py-10">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <Link
            href="https://github.com"
            className="text-xs uppercase tracking-wider text-[--color-muted-foreground] hover:text-[--color-foreground] transition"
          >
            Open source
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-xs text-[--color-muted-foreground]">
          Self-hosted. MIT licensed.
        </p>
      </div>
      <aside className="hidden lg:flex flex-col justify-between border-l border-[--color-border] bg-[--color-sidebar] p-12">
        <div className="flex flex-col gap-10 max-w-md">
          <p className="text-xs uppercase tracking-[0.18em] text-[--color-primary]">
            Agentic AI Copywriter
          </p>
          <h2 className="font-display text-4xl tracking-tight text-balance leading-[1.05]">
            Brief in.<br />
            On-brand copy out.<br />
            <span className="text-[--color-primary]">Across every market.</span>
          </h2>
          <p className="text-pretty text-[--color-muted-foreground]">
            OpenCopy generates marketing copy with multi-agent flows that
            understand your brand voice and transcreate across PL, EN, RO, and UA —
            without the bland, generic-AI smell.
          </p>
        </div>
        <Quote
          text="The voice auditor caught three off-brand lines I would've shipped. That's the difference."
          author="Future testimonial"
          role="Head of Content"
        />
      </aside>
    </div>
  );
}

function Quote({
  text,
  author,
  role,
}: {
  text: string;
  author: string;
  role: string;
}) {
  return (
    <figure className="border-l-2 border-[--color-primary] pl-4">
      <blockquote className="text-sm text-pretty">{text}</blockquote>
      <figcaption className="mt-3 text-xs text-[--color-muted-foreground]">
        — {author}, {role}
      </figcaption>
    </figure>
  );
}
