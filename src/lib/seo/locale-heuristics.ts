import "server-only";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { seoLocaleHeuristicsOverride, type Locale } from "@/db/schema";

import {
  defaultLocaleHeuristics,
  mergeLocaleHeuristics,
  type SeoLocaleHeuristicsFull,
} from "./locale-heuristics-shared";

export {
  defaultLocaleHeuristics,
  mergeLocaleHeuristics,
  LOCALE_HEURISTICS_DEFAULTS,
  type SeoLocaleHeuristicsFull,
} from "./locale-heuristics-shared";

/**
 * Resolve the effective locale heuristics for a workspace+locale.
 *
 * Lookup order:
 *   1. Per-workspace override row in `seo_locale_heuristics_override`.
 *   2. Constant defaults in `locale-heuristics-shared.ts`.
 *
 * Override rows store only the schema-typed subset (`SeoLocaleHeuristics`);
 * non-override fields (search domain, density window, word-count targets)
 * always come from the constants. If those need to become user-tunable
 * later, we promote them into the schema interface — no migration needed
 * (jsonb).
 */
export async function getLocaleHeuristics(
  workspaceId: string,
  locale: Locale,
): Promise<SeoLocaleHeuristicsFull> {
  const base = defaultLocaleHeuristics(locale);

  const row = await db.query.seoLocaleHeuristicsOverride.findFirst({
    where: and(
      eq(seoLocaleHeuristicsOverride.workspaceId, workspaceId),
      eq(seoLocaleHeuristicsOverride.locale, locale),
    ),
  });

  return mergeLocaleHeuristics(base, row?.heuristics ?? null);
}
