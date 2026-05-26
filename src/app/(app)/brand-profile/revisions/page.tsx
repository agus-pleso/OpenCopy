import Link from "next/link";
import { History, ArrowLeft } from "lucide-react";

import { listRevisions } from "@/server/actions/brand-profile";
import { RevisionList } from "@/components/brand-profile/revision-list";

export default async function RevisionsPage() {
  const revisions = await listRevisions();
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10 md:py-14">
      <Link
        href="/brand-profile"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3 w-3" /> Back to profile
      </Link>

      <header className="mt-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          <History className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          History
        </div>
        <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl">
          Revisions
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
          Every save, NL command, deep-dive, and crawl writes a snapshot you can
          roll back to.
        </p>
      </header>

      <div className="mt-8">
        <RevisionList revisions={revisions} />
      </div>
    </div>
  );
}
