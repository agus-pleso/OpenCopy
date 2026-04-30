"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  members,
  userPrefs,
  workspaces,
  type Locale,
} from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
  requireUserId,
  setCurrentWorkspace,
} from "@/lib/auth/workspace";
import { slugify } from "@/lib/utils";

const LocaleEnum = z.enum(["en", "pl", "ro", "uk"]);

/* ----------------------------------------------------------------------------
 * Create a new workspace                                                     */
/* -------------------------------------------------------------------------- */

const CreateSchema = z.object({
  name: z.string().min(2).max(120),
  defaultLocale: LocaleEnum.default("en"),
});

export async function createWorkspace(input: unknown): Promise<{ id: string }> {
  const parsed = CreateSchema.parse(input);
  const userId = await requireUserId();

  const slugBase = slugify(parsed.name) || "workspace";
  const uniqueSlug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;

  const [created] = await db
    .insert(workspaces)
    .values({
      name: parsed.name,
      slug: uniqueSlug,
      defaultLocale: parsed.defaultLocale,
      createdByUserId: userId,
    })
    .returning({ id: workspaces.id });

  await db.insert(members).values({
    workspaceId: created.id,
    userId,
    role: "owner",
  });

  // Switch to the new workspace immediately.
  await db
    .insert(userPrefs)
    .values({ userId, currentWorkspaceId: created.id })
    .onConflictDoUpdate({
      target: userPrefs.userId,
      set: { currentWorkspaceId: created.id, updatedAt: new Date() },
    });

  revalidatePath("/", "layout");
  return { id: created.id };
}

/* ----------------------------------------------------------------------------
 * Switch active workspace                                                    */
/* -------------------------------------------------------------------------- */

export async function switchWorkspace(workspaceId: string): Promise<void> {
  const userId = await requireUserId();
  await setCurrentWorkspace(userId, workspaceId);
  revalidatePath("/", "layout");
}

/* ----------------------------------------------------------------------------
 * List workspaces the current user belongs to                                */
/* -------------------------------------------------------------------------- */

export interface MyWorkspaceRow {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "editor" | "viewer";
  defaultLocale: Locale;
  isCurrent: boolean;
  memberCount: number;
}

export async function listMyWorkspaces(): Promise<MyWorkspaceRow[]> {
  const userId = await requireUserId();

  const myMemberships = await db.query.members.findMany({
    where: eq(members.userId, userId),
    with: {
      workspace: true,
    },
  });

  // Fetch member counts per workspace.
  const counts = await Promise.all(
    myMemberships.map(async (m) => {
      const rows = await db
        .select({ id: members.id })
        .from(members)
        .where(eq(members.workspaceId, m.workspaceId));
      return { workspaceId: m.workspaceId, count: rows.length };
    }),
  );
  const countMap = new Map(counts.map((c) => [c.workspaceId, c.count]));

  const prefs = await db.query.userPrefs.findFirst({
    where: eq(userPrefs.userId, userId),
  });

  return myMemberships
    .filter((m) => m.workspace)
    .map((m) => ({
      id: m.workspace!.id,
      name: m.workspace!.name,
      slug: m.workspace!.slug,
      role: m.role,
      defaultLocale: m.workspace!.defaultLocale,
      isCurrent: prefs?.currentWorkspaceId === m.workspace!.id,
      memberCount: countMap.get(m.workspaceId) ?? 1,
    }))
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || a.name.localeCompare(b.name));
}

/* ----------------------------------------------------------------------------
 * Update workspace meta (name, default locale)                              */
/* -------------------------------------------------------------------------- */

const UpdateSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(2).max(120).optional(),
  defaultLocale: LocaleEnum.optional(),
});

export async function updateWorkspace(input: unknown): Promise<void> {
  const parsed = UpdateSchema.parse(input);
  await requireRole(parsed.workspaceId, "admin");

  const updates: Partial<typeof workspaces.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.name !== undefined) updates.name = parsed.name;
  if (parsed.defaultLocale !== undefined) updates.defaultLocale = parsed.defaultLocale;

  await db
    .update(workspaces)
    .set(updates)
    .where(eq(workspaces.id, parsed.workspaceId));

  revalidatePath("/", "layout");
}

/* ----------------------------------------------------------------------------
 * Leave workspace                                                            */
/* -------------------------------------------------------------------------- */

export async function leaveWorkspace(workspaceId: string): Promise<void> {
  const userId = await requireUserId();

  // Owners can't leave if they're the last owner — protect data integrity.
  const myMembership = await db.query.members.findFirst({
    where: and(eq(members.userId, userId), eq(members.workspaceId, workspaceId)),
  });
  if (!myMembership) throw new Error("NOT_A_MEMBER");

  if (myMembership.role === "owner") {
    const otherOwners = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.workspaceId, workspaceId),
          eq(members.role, "owner"),
        ),
      );
    if (otherOwners.length <= 1) {
      throw new Error(
        "You're the last owner. Promote another member to owner before leaving.",
      );
    }
  }

  await db
    .delete(members)
    .where(
      and(eq(members.userId, userId), eq(members.workspaceId, workspaceId)),
    );

  // If this was the current workspace, switch to another one (or null).
  const prefs = await db.query.userPrefs.findFirst({
    where: eq(userPrefs.userId, userId),
  });
  if (prefs?.currentWorkspaceId === workspaceId) {
    const other = await db.query.members.findFirst({
      where: eq(members.userId, userId),
    });
    await db
      .update(userPrefs)
      .set({
        currentWorkspaceId: other?.workspaceId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(userPrefs.userId, userId));
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/* ----------------------------------------------------------------------------
 * Permanent workspace delete (owner only, only the workspace they're in)    */
/* -------------------------------------------------------------------------- */

export async function deleteCurrentWorkspace(): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "owner");

  await db.delete(workspaces).where(eq(workspaces.id, workspace.id));

  revalidatePath("/", "layout");
  redirect("/");
}
