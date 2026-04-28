import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  members,
  userPrefs,
  workspaces,
  type MemberRole,
  type Workspace,
} from "@/db/schema";
import { slugify } from "@/lib/utils";
import { auth } from "./auth";

const ROLE_RANK: Record<MemberRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

/**
 * Ensure the user has at least one workspace. Called on every sign-in event.
 * If the user has no membership yet, create a personal workspace and grant
 * them the `owner` role.
 */
export async function ensureWorkspaceForUser(
  userId: string,
  email: string | null,
  name: string | null,
): Promise<Workspace> {
  const existingMembership = await db.query.members.findFirst({
    where: eq(members.userId, userId),
    with: { workspace: true },
  });

  if (existingMembership?.workspace) {
    // Make sure userPrefs is set
    const prefs = await db.query.userPrefs.findFirst({
      where: eq(userPrefs.userId, userId),
    });
    if (!prefs) {
      await db.insert(userPrefs).values({
        userId,
        currentWorkspaceId: existingMembership.workspaceId,
      });
    }
    return existingMembership.workspace;
  }

  const baseName = name?.trim() || email?.split("@")[0] || "My Workspace";
  const slugBase = slugify(baseName) || "workspace";
  const uniqueSlug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: `${baseName.replace(/^./, (c) => c.toUpperCase())}'s workspace`,
      slug: uniqueSlug,
      createdByUserId: userId,
    })
    .returning();

  await db.insert(members).values({
    workspaceId: workspace.id,
    userId,
    role: "owner",
  });

  await db
    .insert(userPrefs)
    .values({ userId, currentWorkspaceId: workspace.id })
    .onConflictDoUpdate({
      target: userPrefs.userId,
      set: { currentWorkspaceId: workspace.id, updatedAt: new Date() },
    });

  return workspace;
}

/**
 * Server-side: returns the authenticated user's id or throws.
 * Use in server actions and server components where login is required.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("UNAUTHENTICATED");
  }
  return userId;
}

/**
 * Returns the user's current workspace + their role within it.
 * Throws if the user has no workspace (should not happen after sign-in).
 */
export async function getCurrentWorkspace(): Promise<{
  workspace: Workspace;
  role: MemberRole;
}> {
  const userId = await requireUserId();

  const prefs = await db.query.userPrefs.findFirst({
    where: eq(userPrefs.userId, userId),
  });

  let workspaceId = prefs?.currentWorkspaceId ?? null;

  if (!workspaceId) {
    const firstMembership = await db.query.members.findFirst({
      where: eq(members.userId, userId),
    });
    workspaceId = firstMembership?.workspaceId ?? null;
  }

  if (!workspaceId) {
    throw new Error("NO_WORKSPACE");
  }

  const membership = await db.query.members.findFirst({
    where: and(eq(members.userId, userId), eq(members.workspaceId, workspaceId)),
    with: { workspace: true },
  });

  if (!membership?.workspace) {
    throw new Error("NO_WORKSPACE_MEMBERSHIP");
  }

  return { workspace: membership.workspace, role: membership.role };
}

/**
 * Switches the user's "current workspace". Caller must already verify the
 * user is a member of `workspaceId`.
 */
export async function setCurrentWorkspace(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const membership = await db.query.members.findFirst({
    where: and(eq(members.userId, userId), eq(members.workspaceId, workspaceId)),
  });
  if (!membership) {
    throw new Error("NOT_A_MEMBER");
  }
  await db
    .insert(userPrefs)
    .values({ userId, currentWorkspaceId: workspaceId })
    .onConflictDoUpdate({
      target: userPrefs.userId,
      set: { currentWorkspaceId: workspaceId, updatedAt: new Date() },
    });
}

/**
 * Throws if the current user lacks at least the given role in `workspaceId`.
 * Returns the user's actual role on success.
 */
export async function requireRole(
  workspaceId: string,
  minRole: MemberRole,
): Promise<MemberRole> {
  const userId = await requireUserId();
  const membership = await db.query.members.findFirst({
    where: and(eq(members.userId, userId), eq(members.workspaceId, workspaceId)),
  });
  if (!membership) {
    throw new Error("NOT_A_MEMBER");
  }
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new Error("INSUFFICIENT_ROLE");
  }
  return membership.role;
}

export function compareRoles(a: MemberRole, b: MemberRole): number {
  return ROLE_RANK[a] - ROLE_RANK[b];
}
