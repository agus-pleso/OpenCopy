"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { userPrefs, type ToursCompleted } from "@/db/schema";
import { requireUserId } from "@/lib/auth/workspace";

const TOUR_IDS = [
  "first_run",
  "voices",
  "knowledge",
  "campaigns",
  "library",
  "documents",
  "chat",
  "agents",
] as const;

export type TourId = (typeof TOUR_IDS)[number];

const tourIdSchema = z.enum(TOUR_IDS);

/**
 * Returns the current user's tour-completion bitmap. Missing keys
 * mean "not completed" — first-run tour auto-fires when first_run
 * is missing.
 */
export async function getToursCompleted(): Promise<ToursCompleted> {
  const userId = await requireUserId();
  const row = await db.query.userPrefs.findFirst({
    where: eq(userPrefs.userId, userId),
  });
  return row?.toursCompleted ?? {};
}

/**
 * Marks one tour as completed (or unmarks via { completed: false }).
 * Idempotent — safe to call repeatedly. Skip and finish both flag the
 * tour as done so it doesn't auto-fire again.
 */
export async function markTourCompleted(
  rawId: unknown,
  rawCompleted: unknown = true,
): Promise<void> {
  const id = tourIdSchema.parse(rawId);
  const completed = z.boolean().parse(rawCompleted);

  const userId = await requireUserId();
  const row = await db.query.userPrefs.findFirst({
    where: eq(userPrefs.userId, userId),
  });

  const next: ToursCompleted = { ...(row?.toursCompleted ?? {}), [id]: completed };

  if (row) {
    await db
      .update(userPrefs)
      .set({ toursCompleted: next, updatedAt: new Date() })
      .where(eq(userPrefs.userId, userId));
  } else {
    await db.insert(userPrefs).values({
      userId,
      toursCompleted: next,
    });
  }
}

/**
 * Resets all tour-completion bits to {} so every tour auto-fires again.
 * Used by the "Replay all tours" affordance in the user menu.
 */
export async function resetTours(): Promise<void> {
  const userId = await requireUserId();
  await db
    .update(userPrefs)
    .set({ toursCompleted: {}, updatedAt: new Date() })
    .where(eq(userPrefs.userId, userId));
}
