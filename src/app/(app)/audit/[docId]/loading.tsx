/**
 * Loading skeleton for /audit/[docId]. Mirrors the real layout so the
 * header doesn't shift when results land.
 */

import { Skeleton } from "@/components/ui/skeleton";

export default function AuditLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10 md:py-14">
      <Skeleton className="h-3 w-32" />

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-72" />
        </div>
      </div>

      {/* Composite gauge row */}
      <div className="mt-10 grid items-center gap-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-sm md:grid-cols-[auto_1fr] md:p-10">
        <div className="flex justify-center">
          <Skeleton className="h-[180px] w-[180px] rounded-full" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-2/3 max-w-md" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="h-3 w-44" />
        </div>
      </div>

      {/* Criterion grid */}
      <div className="mt-10">
        <Skeleton className="h-5 w-48" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex w-full flex-col gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
              </div>
              <div className="flex items-end justify-between">
                <Skeleton className="h-16 w-16 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Suggestions */}
      <div className="mt-10 flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-48" />
        <div className="mt-2 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm"
              style={{ opacity: 1 - i * 0.15 }}
            >
              <div className="flex gap-4">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <div className="flex gap-1.5">
                  <Skeleton className="h-8 w-16 rounded-md" />
                  <Skeleton className="h-8 w-16 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
