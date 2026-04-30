"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";

export function LibraryCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy.");
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className="ml-auto inline-flex items-center gap-1 transition hover:text-[var(--color-foreground)]"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> Copy
        </>
      )}
    </button>
  );
}
