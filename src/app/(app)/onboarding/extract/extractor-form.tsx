"use client";

/**
 * The URL paste form. Submits via `startExtractor` then navigates to the
 * same page with ?crawlId=... so the server can render the structured preview.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startExtractor } from "@/server/actions/brand-profile";

interface Props {
  cookieProfiles: Array<{ id: string; domain: string; label: string; last4: string }>;
}

export function ExtractorForm({ cookieProfiles }: Props) {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [jsRendered, setJsRendered] = React.useState(false);
  const [cookieProfileId, setCookieProfileId] = React.useState<string | undefined>();
  const [pending, setPending] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const trimmed = url.trim();
      // Be forgiving — auto-prepend https:// if the marketer just typed example.com.
      const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const res = await startExtractor({
        url: normalized,
        jsRendered,
        cookieProfileId,
      });
      router.push(`/onboarding/extract?crawlId=${res.crawlId}`);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't start crawl.");
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="extract-url">Website URL</Label>
        <div className="flex items-center gap-2">
          <Input
            id="extract-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-brand.com"
            disabled={pending}
            required
            className="flex-1"
          />
          <Button type="submit" disabled={!url.trim() || pending} className="gap-1.5">
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Globe className="h-3.5 w-3.5" />
            )}
            Read site
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 border-t border-[var(--color-border)]/60 pt-6">
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          Advanced
        </p>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={jsRendered}
            onChange={(e) => setJsRendered(e.target.checked)}
            disabled={pending}
            className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
          />
          <span className="min-w-0">
            <span className="block font-medium tracking-tight">Use JS rendering</span>
            <span className="block text-xs text-[var(--color-muted-foreground)]">
              Slower, but reads React, Vue, Svelte single-page apps. Skip for plain HTML or
              Webflow sites.
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cookie-profile">Use a saved login cookie</Label>
          <Select
            value={cookieProfileId ?? "none"}
            onValueChange={(v) => setCookieProfileId(v === "none" ? undefined : v)}
            disabled={pending}
          >
            <SelectTrigger id="cookie-profile">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {cookieProfiles.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label} <span className="text-[var(--color-muted-foreground)]">· {c.domain}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            For crawling pages behind login. Add cookies in{" "}
            <a
              href="/settings/brand-profile"
              className="text-[var(--color-primary)] underline-offset-2 hover:underline"
            >
              Settings → Brand profile
            </a>
            .
          </p>
        </div>
      </div>
    </form>
  );
}
