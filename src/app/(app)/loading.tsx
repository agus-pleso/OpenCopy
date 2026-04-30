/**
 * Page-transition loading UI for every route inside (app).
 * Renders inside the persistent shell (sidebar + topbar stay mounted).
 */
export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10 md:py-14">
      <div className="flex flex-col gap-3">
        <div className="h-3 w-28 animate-pulse rounded-full bg-[var(--color-muted)]" />
        <div className="h-9 w-2/3 max-w-md animate-pulse rounded-md bg-[var(--color-muted)]" />
        <div className="h-4 w-1/2 max-w-sm animate-pulse rounded-md bg-[var(--color-muted)]/70" />
      </div>

      <div className="mt-10 flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
            style={{ opacity: 1 - i * 0.15 }}
          >
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[var(--color-muted)]" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-1/3 animate-pulse rounded-md bg-[var(--color-muted)]" />
              <div className="h-3 w-2/3 animate-pulse rounded-md bg-[var(--color-muted)]/70" />
            </div>
            <div className="h-8 w-20 animate-pulse rounded-md bg-[var(--color-muted)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
