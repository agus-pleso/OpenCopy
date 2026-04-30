"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { members, users, type MemberRole } from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
  requireUserId,
  compareRoles,
} from "@/lib/auth/workspace";

const RoleEnum = z.enum([
  "owner",
  "admin",
  "editor",
  "viewer",
]) satisfies z.ZodType<MemberRole>;

export interface MemberRow {
  memberId: string;
  userId: string;
  email: string;
  name: string | null;
  role: MemberRole;
  joinedAt: Date;
  isCurrentUser: boolean;
}

/* ----------------------------------------------------------------------------
 * List members of the current workspace                                      */
/* -------------------------------------------------------------------------- */

export async function listMembers(): Promise<MemberRow[]> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "viewer");
  const me = await requireUserId();

  const rows = await db.query.members.findMany({
    where: eq(members.workspaceId, workspace.id),
    with: { user: true },
  });

  return rows.map((m) => ({
    memberId: m.id,
    userId: m.userId,
    email: m.user?.email ?? "",
    name: m.user?.name ?? null,
    role: m.role,
    joinedAt: m.createdAt,
    isCurrentUser: m.userId === me,
  }));
}

/* ----------------------------------------------------------------------------
 * Change a member's role                                                     */
/* -------------------------------------------------------------------------- */

const ChangeRoleSchema = z.object({
  memberId: z.string().uuid(),
  role: RoleEnum,
});

export async function changeMemberRole(input: unknown): Promise<void> {
  const parsed = ChangeRoleSchema.parse(input);
  const { workspace, role: actorRole } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");

  const target = await db.query.members.findFirst({
    where: and(eq(members.id, parsed.memberId), eq(members.workspaceId, workspace.id)),
  });
  if (!target) throw new Error("MEMBER_NOT_FOUND");

  // Only owners can promote to / demote from owner.
  if ((parsed.role === "owner" || target.role === "owner") && actorRole !== "owner") {
    throw new Error("Only owners can change owner roles.");
  }

  // Don't allow demoting the last owner.
  if (target.role === "owner" && parsed.role !== "owner") {
    const owners = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(eq(members.workspaceId, workspace.id), eq(members.role, "owner")),
      );
    if (owners.length <= 1) {
      throw new Error(
        "Can't demote the last owner. Promote another member to owner first.",
      );
    }
  }

  await db
    .update(members)
    .set({ role: parsed.role })
    .where(eq(members.id, parsed.memberId));

  revalidatePath("/settings/members");
}

/* ----------------------------------------------------------------------------
 * Remove a member                                                            */
/* -------------------------------------------------------------------------- */

export async function removeMember(memberId: string): Promise<void> {
  const { workspace, role: actorRole } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");
  const me = await requireUserId();

  const target = await db.query.members.findFirst({
    where: and(eq(members.id, memberId), eq(members.workspaceId, workspace.id)),
  });
  if (!target) throw new Error("MEMBER_NOT_FOUND");

  if (target.userId === me) {
    throw new Error(
      "Use 'Leave workspace' to remove yourself — it handles the last-owner case correctly.",
    );
  }

  // Can't remove someone with equal-or-higher role unless you're an owner
  // removing another non-owner, OR the actor is owner.
  if (compareRoles(actorRole, target.role) < 0 && actorRole !== "owner") {
    throw new Error("You can't remove a member with a higher role.");
  }

  // Don't allow removing the last owner.
  if (target.role === "owner") {
    const owners = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(eq(members.workspaceId, workspace.id), eq(members.role, "owner")),
      );
    if (owners.length <= 1) {
      throw new Error("Can't remove the last owner.");
    }
  }

  await db.delete(members).where(eq(members.id, memberId));

  revalidatePath("/settings/members");
}

// Avoid unused-import warnings while keeping `users` available for future joins.
void users;
