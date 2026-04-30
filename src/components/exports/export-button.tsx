"use client";

import * as React from "react";
import { Download, FileText, Globe, FileType, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/export/formats";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  Globe,
  FileType,
};

interface Props {
  /** "document" → /api/export/document/[id]; "variant" → /api/export/variant/[id] */
  kind: "document" | "variant";
  id: string;
  /** Optional label overrides the default. */
  label?: string;
  size?: "sm" | "default";
  variant?: "ghost" | "outline" | "default";
}

export function ExportButton({
  kind,
  id,
  label = "Export",
  size = "sm",
  variant = "outline",
}: Props) {
  const [busyFormat, setBusyFormat] = React.useState<ExportFormat | null>(null);

  const onSelect = async (format: ExportFormat) => {
    setBusyFormat(format);
    try {
      const res = await fetch(
        `/api/export/${kind}/${id}?format=${format}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const blob = await res.blob();

      // Try to read the filename from Content-Disposition.
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `export.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    } finally {
      setBusyFormat(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size}>
          <Download className="h-3.5 w-3.5" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Export as…</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {EXPORT_FORMATS.map((f) => {
          const Icon = ICON_MAP[f.icon] ?? FileText;
          const busy = busyFormat === f.id;
          return (
            <DropdownMenuItem
              key={f.id}
              disabled={busyFormat !== null}
              onClick={() => onSelect(f.id)}
              className="flex items-start gap-2.5"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[--color-muted] text-[--color-muted-foreground]">
                {busy ? (
                  <Check className="h-3 w-3 animate-pulse" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block font-medium tracking-tight">
                  {f.label}
                </span>
                <span className="block text-[11px] text-[--color-muted-foreground] text-pretty">
                  {f.description}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
