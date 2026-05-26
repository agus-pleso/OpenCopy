"use client";

/**
 * cookie-profile-form — BYOK cookie store CRUD. List existing saved cookies,
 * paste-to-add, delete. The actual cookie value is AES-encrypted server-side
 * via encryptSecret(); only the last 4 chars surface in the UI.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Cookie, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteCookieProfile,
  saveCookieProfile,
} from "@/server/actions/brand-profile";

interface CookieProfileRow {
  id: string;
  domain: string;
  label: string;
  last4: string;
}

interface Props {
  profiles: CookieProfileRow[];
}

export function CookieProfileForm({ profiles }: Props) {
  const router = useRouter();
  const [domain, setDomain] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [cookieValue, setCookieValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await saveCookieProfile({ domain: domain.trim(), label: label.trim(), cookieValue });
      toast.success("Saved.");
      setDomain("");
      setLabel("");
      setCookieValue("");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteCookieProfile(id);
      toast.success("Deleted.");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Couldn't delete.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {profiles.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
          {profiles.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 border-t border-[var(--color-border)]/60 px-4 py-3 first:border-t-0"
            >
              <Cookie className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium tracking-tight">{p.label}</p>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  <span className="font-mono">{p.domain}</span>
                  <span className="ml-2 text-[var(--color-muted-foreground)]/70">
                    ends in <span className="font-mono">{p.last4}</span>
                  </span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(p.id)}
                disabled={deletingId === p.id}
                className="gap-1.5 text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10 hover:text-[var(--color-destructive)]"
              >
                {deletingId === p.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
      >
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
          Add cookie
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          For crawling login-gated content. Stored AES-encrypted; only the last 4 chars are ever shown.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cookie-domain">Domain</Label>
            <Input
              id="cookie-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cookie-label">Label</Label>
            <Input
              id="cookie-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My Notion workspace"
              required
            />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor="cookie-value">Cookie value</Label>
          <Textarea
            id="cookie-value"
            value={cookieValue}
            onChange={(e) => setCookieValue(e.target.value)}
            placeholder="key1=value1; key2=value2"
            className="min-h-[100px] font-mono text-xs"
            required
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Save cookie
          </Button>
        </div>
      </form>
    </div>
  );
}
