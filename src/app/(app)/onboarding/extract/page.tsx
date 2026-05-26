import Link from "next/link";
import { Globe, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentWorkspace } from "@/lib/auth/workspace";
import {
  getCrawlResult,
  listCookieProfiles,
} from "@/server/actions/brand-profile";
import { ExtractorForm } from "./extractor-form";
import { ExtractorPreview } from "@/components/brand-profile/extractor-preview";

interface PageProps {
  searchParams: Promise<{ crawlId?: string }>;
}

export default async function ExtractorPage({ searchParams }: PageProps) {
  const { crawlId } = await searchParams;
  const { workspace } = await getCurrentWorkspace();
  const cookieProfiles = await listCookieProfiles();

  // Two stages on the same route — pre-crawl form vs. post-crawl preview.
  // When ?crawlId=…, render the editable preview against the crawl row.
  if (crawlId) {
    let crawl;
    try {
      crawl = await getCrawlResult(crawlId);
    } catch {
      redirect("/onboarding/extract");
    }

    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
        <Header />
        <p className="mt-3 max-w-2xl text-sm text-pretty text-[var(--color-muted-foreground)]">
          Here&apos;s what I found. Adjust anything that&apos;s off before applying.
        </p>
        <div className="mt-10">
          {crawl.status === "ready" ? (
            <ExtractorPreview crawl={crawl} defaultName={workspace.name} />
          ) : crawl.status === "pending" ? (
            <PendingState url={crawl.url} />
          ) : (
            <FailedState url={crawl.url} error={crawl.error} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10 md:py-14">
      <Header />
      <p className="mt-3 text-pretty text-[var(--color-muted-foreground)]">
        Paste your website and I&apos;ll extract a starter brand profile — voice,
        audience hints, positioning, and product facts.
      </p>
      <p className="mt-3 text-sm">
        <Link
          href="/onboarding"
          className="text-[var(--color-primary)] underline-offset-2 hover:underline"
        >
          Prefer to chat?
        </Link>{" "}
        <span className="text-[var(--color-muted-foreground)]">
          I&apos;ll ask you questions instead.
        </span>
      </p>
      <div className="mt-10">
        <ExtractorForm cookieProfiles={cookieProfiles} />
      </div>
    </div>
  );
}

function Header() {
  return (
    <header>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
        <Globe className="h-3.5 w-3.5 text-[var(--color-primary)]" />
        Extract from URL
      </div>
      <h1 className="mt-3 font-display text-4xl tracking-tight md:text-5xl text-balance">
        Read my website.
      </h1>
    </header>
  );
}

function PendingState({ url }: { url: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-10 text-center">
      <Sparkles className="mx-auto h-6 w-6 animate-pulse text-[var(--color-primary)]" />
      <p className="mt-3 font-display text-lg tracking-tight">Reading your site…</p>
      <p className="mt-1 text-xs font-mono text-[var(--color-muted-foreground)]">{url}</p>
      <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
        Refresh in a few seconds if this doesn&apos;t auto-advance.
      </p>
    </div>
  );
}

function FailedState({ url, error }: { url: string; error: string | null }) {
  return (
    <div className="rounded-2xl border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 px-6 py-10 text-center">
      <p className="font-display text-lg tracking-tight text-[var(--color-destructive)]">
        Crawl failed
      </p>
      <p className="mt-1 text-xs font-mono text-[var(--color-muted-foreground)]">{url}</p>
      {error && (
        <p className="mt-3 text-sm text-[var(--color-destructive)]/90">{error}</p>
      )}
      <Link
        href="/onboarding/extract"
        className="mt-4 inline-block text-sm text-[var(--color-primary)] underline-offset-2 hover:underline"
      >
        Try a different URL
      </Link>
    </div>
  );
}
