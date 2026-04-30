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

const NAV: NavItem[] = [
  { label: "Brand voices", href: "/voices", icon: ScanText },
  { label: "Knowledge", href: "/knowledge", icon: BookOpen },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Chat", href: "/chat", icon: MessageSquare },
  { label: "Library", href: "/library", icon: Library },
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

      <nav className="flex-1 px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
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
