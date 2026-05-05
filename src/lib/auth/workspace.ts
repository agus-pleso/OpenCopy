import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  members,
  userPrefs,
  users,
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
 *
 * Defensively verifies the JWT-claimed user actually exists in the database.
 * Without this check, a stale session (e.g. data dir wiped between launches,
 * user manually deleted, JWT carried across reinstalls) cascades into FK
 * violations downstream — every insert touching a user-bound table fails
 * with `Key (user_id)=... is not present in table "user"`. Surfacing
 * UNAUTHENTICATED here lets the layout redirect to /login cleanly.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("UNAUTHENTICATED");
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true },
  });
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return userId;
}

/**
 * Returns the user's current workspace + their role within it.
 *
 * Self-heals when the user has no membership yet — typically because
 * NextAuth's `events.signIn` only fires on actual sign-ins, not on JWT
 * re-validations. A user whose JWT survives a data dir wipe (e.g.
 * reinstalling the desktop app, switching deployments) ends up "logged
 * in" without ever re-running ensureWorkspaceForUser. Calling it on
 * demand here guarantees every authenticated user has at least a
 * personal workspace.
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
    // No workspace at all — auto-recover by provisioning the personal one
    // that signIn would have created. ensureWorkspaceForUser is idempotent
    // (it returns the existing membership if one already exists).
    const session = await auth();
    const email = session?.user?.email ?? null;
    const name = session?.user?.name ?? null;
    const workspace = await ensureWorkspaceForUser(userId, email, name);
    return { workspace, role: "owner" };
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
