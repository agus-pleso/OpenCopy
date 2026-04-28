"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  Bot,
  Library,
  Settings,
  ScanText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/marketing/logo";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Path prefixes that should mark this item active. */
  activeWhen?: string[];
  hint?: string;
}

const NAV: NavItem[] = [
  { label: "Brand voices", href: "/voices", icon: ScanText },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Library", href: "/library", icon: Library },
];

const FOOTER_NAV: NavItem[] = [
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    activeWhen: ["/settings"],
  },
];

export function Sidebar({ workspaceName }: { workspaceName: string }) {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    if (item.activeWhen?.some((p) => pathname.startsWith(p))) return true;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-[--color-sidebar-border] bg-[--color-sidebar] text-[--color-sidebar-foreground]">
      <div className="flex h-14 items-center px-5">
        <Link href="/" className="block">
          <Logo />
        </Link>
      </div>

      <div className="px-3 pb-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md border border-[--color-sidebar-border] bg-[--color-background]/40 px-2.5 py-2 text-sm transition hover:bg-[--color-sidebar-accent]"
        >
          <Sparkles className="h-4 w-4 text-[--color-primary]" />
          <span className="truncate font-medium">{workspaceName}</span>
        </Link>
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
                      ? "bg-[--color-sidebar-accent] text-[--color-sidebar-accent-foreground] font-medium"
                      : "text-[--color-sidebar-foreground]/80 hover:bg-[--color-sidebar-accent] hover:text-[--color-sidebar-accent-foreground]",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.hint && (
                    <span className="text-[10px] uppercase tracking-wider text-[--color-muted-foreground]/80">
                      {item.hint}
                    </span>
                  )}
                  {active && (
                    <span className="absolute inset-y-1 left-0 w-0.5 rounded-r-sm bg-[--color-primary]" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-[--color-sidebar-border] px-2 py-2">
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
                      ? "bg-[--color-sidebar-accent] text-[--color-sidebar-accent-foreground] font-medium"
                      : "text-[--color-sidebar-foreground]/80 hover:bg-[--color-sidebar-accent] hover:text-[--color-sidebar-accent-foreground]",
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
