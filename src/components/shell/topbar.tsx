"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

interface TopbarProps {
  user: { email: string; name: string | null };
  workspaceName: string;
  role: string;
}

const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/voices": "Brand voices",
  "/knowledge": "Knowledge",
  "/agents": "Agents",
  "/agents/copywriter": "Copywriter",
  "/agents/localizer": "Localizer",
  "/agents/runs": "Runs",
  "/campaigns": "Campaigns",
  "/campaigns/new": "New campaign",
  "/documents": "Documents",
  "/chat": "Chat",
  "/library": "Library",
  "/settings": "Settings",
  "/settings/workspace": "Workspace",
  "/settings/members": "Members",
  "/settings/ai": "AI providers",
  "/settings/usage": "Usage",
  "/invitations": "Invitation",
};

interface Crumb {
  href: string;
  label: string;
  isLast: boolean;
}

/**
 * Build breadcrumbs from a pathname. Dynamic segments (UUIDs / numeric IDs /
 * tokens) are skipped; known routes get human-readable labels; unknown segments
 * are title-cased as a fallback.
 */
function buildCrumbs(pathname: string): Crumb[] {
  if (pathname === "/") return [{ href: "/", label: "Dashboard", isLast: true }];

  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Omit<Crumb, "isLast">[] = [];
  let acc = "";
  for (const part of parts) {
    acc += "/" + part;
    const known = ROUTE_LABELS[acc];
    if (known) {
      crumbs.push({ href: acc, label: known });
      continue;
    }
    // Skip dynamic segments that look like IDs / tokens.
    if (/^[0-9a-f-]{8,}$/i.test(part) || /^\d+$/.test(part)) continue;
    // Unknown but human-looking — title-case it.
    crumbs.push({
      href: acc,
      label: part.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  }
  return crumbs.map((c, i) => ({ ...c, isLast: i === crumbs.length - 1 }));
}

export function Topbar({ user, workspaceName, role }: TopbarProps) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)]/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-background)]/70 md:px-6">
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-sm"
      >
        {crumbs.map((c, i) => (
          <span key={c.href} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && (
              <ChevronRight
                className="h-3 w-3 shrink-0 text-[var(--color-muted-foreground)]/60"
                aria-hidden="true"
              />
            )}
            {c.isLast ? (
              <span className="truncate font-display tracking-tight text-[var(--color-foreground)]">
                {c.label}
              </span>
            ) : (
              <Link
                href={c.href}
                className="truncate text-[var(--color-muted-foreground)] transition hover:text-[var(--color-foreground)]"
              >
                {c.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

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
