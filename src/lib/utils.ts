import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function formatDistanceShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

/**
 * Detect Next.js's `redirect()` control-flow signal so we can re-throw it
 * instead of swallowing it into a toast. Server actions that call
 * `redirect()` throw an Error with `digest` starting with "NEXT_REDIRECT" —
 * Next.js intercepts that on its way back up the stack to perform the
 * navigation. If a generic `catch (err)` block toasts the message, the
 * navigation never happens and the user sees "NEXT_REDIRECT" as an error.
 *
 * Usage:
 *   try { await deleteCampaign(id); }
 *   catch (err) {
 *     if (isRedirectError(err)) throw err;
 *     toast.error(...);
 *   }
 */
export function isRedirectError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** Same idea for `notFound()` — throws with digest "NEXT_NOT_FOUND". */
export function isNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_NOT_FOUND");
}
