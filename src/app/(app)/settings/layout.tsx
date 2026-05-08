"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, Building2, Activity, Users, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const SETTINGS_NAV = [
  {
    label: "Workspace",
    href: "/settings/workspace",
    icon: Building2,
    description: "Name, locale, danger zone.",
  },
  {
    label: "Members",
    href: "/settings/members",
    icon: Users,
    description: "Roles, invitations, access.",
  },
  {
    label: "AI providers",
    href: "/settings/ai",
    icon: KeyRound,
    description: "Keys, embeddings, model defaults.",
  },
  {
    label: "Channels",
    href: "/settings/channels",
    icon: Layers,
    description: "Components per channel, drag-reorder.",
  },
  {
    label: "Usage",
    href: "/settings/usage",
    icon: Activity,
    description: "Tokens + estimated spend.",
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10 md:py-14">
      <h1 className="font-display text-4xl tracking-tight">Settings</h1>

      <div className="mt-10 grid gap-10 md:grid-cols-[220px_1fr]">
        <nav className="md:sticky md:top-20 md:self-start">
          <ul className="flex flex-col gap-0.5">
            {SETTINGS_NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-start gap-2.5 rounded-md px-3 py-2 text-sm transition",
                      active
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                        : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium tracking-tight text-[var(--color-foreground)]">
                        {item.label}
                      </div>
                      <div className="text-xs text-[var(--color-muted-foreground)] line-clamp-1">
                        {item.description}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
