"use client";

import { signOut } from "next-auth/react";
import { LogOut, Settings, User as UserIcon } from "lucide-react";
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
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[--color-primary] text-[--color-primary-foreground] text-xs font-semibold">
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
          <div className="text-xs text-[--color-muted-foreground] truncate">
            {email}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <div className="px-3 pb-2">
          <div className="text-sm font-medium">{workspaceName}</div>
          <div className="text-xs text-[--color-muted-foreground]">
            Role: <span className="capitalize">{role}</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/workspace">
            <UserIcon className="h-4 w-4" /> Workspace
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/ai">
            <Settings className="h-4 w-4" /> AI providers
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-[--color-destructive] focus:text-[--color-destructive]"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
