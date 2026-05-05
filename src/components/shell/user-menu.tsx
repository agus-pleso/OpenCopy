"use client";

import { signOut } from "next-auth/react";
import {
  LogOut,
  Settings,
  KeyRound,
  Users,
  Activity,
  Building2,
  Compass,
} from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ALL_TOURS } from "@/lib/tours/definitions";
import { useTours } from "@/components/tours/tour-runner";

export function UserMenu({
  email,
  name,
  workspaceName,
  role,
}: {
  email: string;
  name: string | null;
  workspaceName: string;
  role: string;
}) {
  const { startTour } = useTours();
  const initials = (name || email)
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 gap-2 px-2 text-sm font-medium"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-xs font-semibold">
            {initials || "·"}
          </span>
          <span className="hidden sm:inline truncate max-w-[180px]">
            {name || email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-3 pb-2 pt-2">
          <div className="text-sm font-medium leading-tight">
            {name || email.split("@")[0]}
          </div>
          <div className="text-xs text-[var(--color-muted-foreground)] truncate">
            {email}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <div className="px-3 pb-2">
          <div className="text-sm font-medium">{workspaceName}</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">
            Role: <span className="capitalize">{role}</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Settings</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/settings/workspace">
            <Building2 className="h-4 w-4" /> Workspace
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/members">
            <Users className="h-4 w-4" /> Members
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/ai">
            <KeyRound className="h-4 w-4" /> AI providers
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/usage">
            <Activity className="h-4 w-4" /> Usage
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="h-4 w-4" /> All settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Guided tours</DropdownMenuLabel>
        {ALL_TOURS.map((tour) => (
          <DropdownMenuItem
            key={tour.id}
            onSelect={(e) => {
              e.preventDefault();
              startTour(tour.id);
            }}
          >
            <Compass className="h-4 w-4" />
            {tour.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-[var(--color-destructive)] focus:text-[var(--color-destructive)]"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
