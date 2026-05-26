/**
 * Apply a NL-command-derived JSON patch to a BrandProfile.
 *
 * Pure — no `server-only` import — so server actions AND smoke tests can
 * call it directly.
 *
 * Supports dot-path traversal (e.g., `voice.pl.formality`, `voice.pl.dos`,
 * `audiences.en`, `positioning.differentiators`, `competitors`).
 *
 * Op semantics:
 *   - `set`: replace the value at `field`. Creates intermediate objects on
 *     the way if missing (so `voice.uk.toneDescriptors` works even when
 *     `voice.uk` isn't there yet).
 *   - `append`: target MUST resolve to an array. The value is concat'd
 *     onto the end. If `value` is itself an array, all items are appended;
 *     a non-array value is appended as a single item.
 *   - `remove`: if `value` is undefined, delete the key. If `value` is
 *     provided and target is an array, pull all elements that match — by
 *     strict equality for primitives, by `.id` for objects with an `id`
 *     field, by deep-equal otherwise.
 */

import type { BrandProfile } from "@/db/schema";
import type { NlPatchChange } from "./brand-profile-editor";

export interface PatchDiffEntry {
  field: string;
  before: unknown;
  after: unknown;
}

function splitPath(path: string): string[] {
  return path
    .split(".")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  );
}

function getAt(obj: Record<string, unknown>, parts: string[]): unknown {
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Walk to the parent, creating intermediate objects as needed. */
function getOrCreateParent(
  root: Record<string, unknown>,
  parts: string[],
): { parent: Record<string, unknown>; lastKey: string } | null {
  if (parts.length === 0) return null;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (next == null || typeof next !== "object" || Array.isArray(next)) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  return { parent: cur, lastKey: parts[parts.length - 1] };
}

function cloneJson<T>(v: T): T {
  // structuredClone is widely available in Node 18+, but JSON-clone is fine
  // for our jsonb-shaped data (no Dates, no functions).
  return JSON.parse(JSON.stringify(v)) as T;
}

export interface ApplyPatchResult {
  profile: BrandProfile;
  diff: PatchDiffEntry[];
}

export function applyNlPatch(
  profile: BrandProfile,
  changes: NlPatchChange[],
): ApplyPatchResult {
  const next = cloneJson(profile) as Record<string, unknown>;
  const diff: PatchDiffEntry[] = [];

  for (const change of changes) {
    const parts = splitPath(change.field);
    if (parts.length === 0) continue;

    const before = cloneJson(getAt(next, parts));

    if (change.op === "set") {
      const located = getOrCreateParent(next, parts);
      if (!located) continue;
      located.parent[located.lastKey] = cloneJson(change.value);
      const after = cloneJson(getAt(next, parts));
      diff.push({ field: change.field, before, after });
      continue;
    }

    if (change.op === "append") {
      const located = getOrCreateParent(next, parts);
      if (!located) continue;
      const current = located.parent[located.lastKey];
      const arr = Array.isArray(current) ? [...current] : [];
      if (Array.isArray(change.value)) {
        for (const item of change.value) arr.push(cloneJson(item));
      } else if (typeof change.value !== "undefined") {
        arr.push(cloneJson(change.value));
      }
      located.parent[located.lastKey] = arr;
      const after = cloneJson(getAt(next, parts));
      diff.push({ field: change.field, before, after });
      continue;
    }

    if (change.op === "remove") {
      const located = getOrCreateParent(next, parts);
      if (!located) continue;
      const current = located.parent[located.lastKey];

      if (typeof change.value === "undefined") {
        // Delete the key entirely.
        delete located.parent[located.lastKey];
        diff.push({ field: change.field, before, after: undefined });
        continue;
      }

      if (Array.isArray(current)) {
        const valueToRemove = change.value;
        const isObjMatch = (x: unknown): boolean => {
          if (
            x &&
            typeof x === "object" &&
            !Array.isArray(x) &&
            valueToRemove &&
            typeof valueToRemove === "object" &&
            !Array.isArray(valueToRemove)
          ) {
            const xid = (x as Record<string, unknown>).id;
            const vid = (valueToRemove as Record<string, unknown>).id;
            if (xid !== undefined && vid !== undefined && xid === vid) return true;
            return deepEqual(x, valueToRemove);
          }
          return false;
        };
        const filtered = current.filter((x) => {
          if (typeof x === typeof valueToRemove && typeof x !== "object") {
            return x !== valueToRemove;
          }
          return !(isObjMatch(x) || deepEqual(x, valueToRemove));
        });
        located.parent[located.lastKey] = filtered;
        diff.push({
          field: change.field,
          before,
          after: cloneJson(filtered),
        });
        continue;
      }

      // Non-array remove with a value: treat as no-op (avoid silently
      // clobbering a primitive when the model emitted a slightly-wrong op).
      diff.push({ field: change.field, before, after: before });
    }
  }

  return {
    profile: next as unknown as BrandProfile,
    diff,
  };
}
