"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  Library,
  Settings,
  ScanText,
  FileText,
  BookOpen,
  MessageSquare,
  Megaphone,
  Languages,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/marketing/logo";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";
import type { MyWorkspaceRow } from "@/server/actions/workspaces";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Path prefixes that should mark this item active. */
  activeWhen?: string[];
  /** Path prefixes that should explicitly NOT mark this item active, overriding other matches. */
  activeExcept?: string[];
  hint?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Three-bucket IA designed around the marketing-team daily flow:
 *   BRAND   — "who are we?" (the rails: voice + knowledge)
 *   WORK    — "what are we shipping?" (campaigns) and "what's the canonical
 *             archive?" (library)
 *   COMPOSE — "help me draft this" (the four creation surfaces)
 *
 * The /agents listing route is still reachable (via breadcrumbs from any
 * specific run, or the dashboard's recent-runs widget) — we just don't
 * promote it to a top-level sidebar slot anymore.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Brand",
    items: [
      { label: "Voices", href: "/voices", icon: ScanText },
      { label: "Knowledge", href: "/knowledge", icon: BookOpen },
    ],
  },
  {
    label: "Work",
    items: [
      { label: "Campaigns", href: "/campaigns", icon: Megaphone },
      { label: "Library", href: "/library", icon: Library },
    ],
  },
  {
    label: "Compose",
    items: [
      {
        label: "Copywriter",
        href: "/agents/copywriter",
        icon: Bot,
      },
      {
        label: "Localizer",
        href: "/agents/localizer",
        icon: Languages,
      },
      { label: "Long-form", href: "/documents", icon: FileText },
      { label: "Chat", href: "/chat", icon: MessageSquare },
    ],
  },
];

const FOOTER_NAV: NavItem[] = [
  {
    label: "Usage",
    href: "/settings/usage",
    icon: Activity,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    activeWhen: ["/settings"],
    activeExcept: ["/settings/usage"],
  },
];

export function Sidebar({
  currentWorkspace,
  workspaces,
}: {
  currentWorkspace: { id: string; name: string };
  workspaces: MyWorkspaceRow[];
}) {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    if (
      item.activeExcept?.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      )
    ) {
      return false;
    }
    if (item.activeWhen?.some((p) => pathname.startsWith(p))) return true;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)]">
      <div className="flex h-14 items-center px-5">
        <Link href="/" className="block">
          <Logo />
        </Link>
      </div>

      <div className="px-3 pb-3">
        <WorkspaceSwitcher current={currentWorkspace} workspaces={workspaces} />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {NAV_GROUPS.map((group, groupIdx) => (
          <div
            key={group.label}
            className={cn("flex flex-col gap-0.5", groupIdx > 0 && "mt-4")}
          >
            <div
              className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-sidebar-foreground)]/45"
              aria-hidden="true"
            >
              {group.label}
            </div>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      data-tour={`nav-${item.href}`}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition",
                        active
                          ? "bg-[var(--color-sidebar-accent)] text-[var(--color-sidebar-accent-foreground)] font-medium"
                          : "text-[var(--color-sidebar-foreground)]/80 hover:bg-[var(--color-sidebar-accent)] hover:text-[var(--color-sidebar-accent-foreground)]",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.hint && (
                        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]/80">
                          {item.hint}
                        </span>
                      )}
                      {active && (
                        <span className="absolute inset-y-1 left-0 w-0.5 rounded-r-sm bg-[var(--color-primary)]" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--color-sidebar-border)] px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {FOOTER_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-tour={`nav-${item.href}`}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition",
                    active
                      ? "bg-[var(--color-sidebar-accent)] text-[var(--color-sidebar-accent-foreground)] font-medium"
                      : "text-[var(--color-sidebar-foreground)]/80 hover:bg-[var(--color-sidebar-accent)] hover:text-[var(--color-sidebar-accent-foreground)]",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
