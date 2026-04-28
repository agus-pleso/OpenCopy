"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bot, Library, ScanText, Settings, Sparkles, Sun, Moon } from "lucide-react";
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
          <CommandItem onSelect={() => go("/voices")}>
            <ScanText className="h-4 w-4" /> Brand voices
            <CommandShortcut>G V</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/agents")}>
            <Bot className="h-4 w-4" /> Agents
            <CommandShortcut>G A</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/library")}>
            <Library className="h-4 w-4" /> Library
            <CommandShortcut>G L</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => go("/settings/workspace")}>
            <Settings className="h-4 w-4" /> Workspace
          </CommandItem>
          <CommandItem onSelect={() => go("/settings/ai")}>
            <Settings className="h-4 w-4" /> AI providers
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
