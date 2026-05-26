"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  BookOpen,
  Building2,
  Activity,
  FileText,
  KeyRound,
  Languages,
  Library,
  Megaphone,
  MessageSquare,
  Moon,
  ScanText,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search OpenCopy…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/")}>
            <Sparkles className="h-4 w-4" /> Dashboard
            <CommandShortcut>G H</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/brand-profile")}>
            <Sparkles className="h-4 w-4" /> Brand profile
            <CommandShortcut>G B</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/voices")}>
            <ScanText className="h-4 w-4" /> Brand voices
            <CommandShortcut>G V</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/knowledge")}>
            <BookOpen className="h-4 w-4" /> Knowledge
            <CommandShortcut>G K</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/agents")}>
            <Bot className="h-4 w-4" /> Agents
            <CommandShortcut>G A</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/campaigns")}>
            <Megaphone className="h-4 w-4" /> Campaigns
            <CommandShortcut>G C</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/documents")}>
            <FileText className="h-4 w-4" /> Documents
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/chat")}>
            <MessageSquare className="h-4 w-4" /> Chat
            <CommandShortcut>G T</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/library")}>
            <Library className="h-4 w-4" /> Library
            <CommandShortcut>G L</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Run an agent">
          <CommandItem onSelect={() => go("/agents/copywriter")}>
            <Bot className="h-4 w-4" /> New copywriter run
          </CommandItem>
          <CommandItem onSelect={() => go("/agents/localizer")}>
            <Languages className="h-4 w-4" /> New localizer run
          </CommandItem>
          <CommandItem onSelect={() => go("/campaigns/new")}>
            <Megaphone className="h-4 w-4" /> New campaign
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => go("/settings/workspace")}>
            <Building2 className="h-4 w-4" /> Workspace
          </CommandItem>
          <CommandItem onSelect={() => go("/settings/members")}>
            <Users className="h-4 w-4" /> Members
          </CommandItem>
          <CommandItem onSelect={() => go("/settings/ai")}>
            <KeyRound className="h-4 w-4" /> AI providers
          </CommandItem>
          <CommandItem onSelect={() => go("/settings/usage")}>
            <Activity className="h-4 w-4" /> Usage
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem
            onSelect={() => {
              setTheme("light");
              setOpen(false);
            }}
          >
            <Sun className="h-4 w-4" /> Light
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme("dark");
              setOpen(false);
            }}
          >
            <Moon className="h-4 w-4" /> Dark
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
