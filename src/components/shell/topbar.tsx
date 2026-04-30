"use client";

import { Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

interface TopbarProps {
  user: { email: string; name: string | null };
  workspaceName: string;
  role: string;
  /** Optional page title shown on the left, e.g. "Brand voices". */
  pageTitle?: string;
}

export function Topbar({ user, workspaceName, role, pageTitle }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)]/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-background)]/70 md:px-6">
      <div className="flex flex-1 items-center gap-3">
        {pageTitle && (
          <h1 className="font-display text-base tracking-tight">
            {pageTitle}
          </h1>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true }),
          );
        }}
        className="hidden md:inline-flex h-8 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search OpenCopy</span>
        <kbd className="ml-2 rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>

      <ThemeToggle />
      <UserMenu
        email={user.email}
        name={user.name}
        workspaceName={workspaceName}
        role={role}
      />
    </header>
  );
}
