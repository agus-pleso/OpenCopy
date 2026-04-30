"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  members,
  userPrefs,
  users,
  workspaceInvitations,
  type MemberRole,
} from "@/db/schema";
import {
  getCurrentWorkspace,
  requireRole,
  requireUserId,
} from "@/lib/auth/workspace";

const RoleEnum = z.enum([
  "admin",
  "editor",
  "viewer",
]) satisfies z.ZodType<Exclude<MemberRole, "owner">>;

/** 7-day default invitation expiry. */
const DEFAULT_EXPIRY_DAYS = 7;

function makeToken(): string {
  return randomBytes(32).toString("base64url");
}

/* ----------------------------------------------------------------------------
 * Create an invitation                                                       */
/* -------------------------------------------------------------------------- */

const CreateSchema = z.object({
  email: z.string().email().max(320),
  role: RoleEnum,
});

export interface CreateInvitationResult {
  ok: boolean;
  invitationId?: string;
  inviteUrl?: string;
  message?: string;
}

export async function createInvitation(
  input: unknown,
): Promise<CreateInvitationResult> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");
  const userId = await requireUserId();

  // If this email already corresponds to a member, refuse.
  const existingMember = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email.toLowerCase()),
  });
  if (existingMember) {
    const ms = await db.query.members.findFirst({
      where: and(
        eq(members.userId, existingMember.id),
        eq(members.workspaceId, workspace.id),
      ),
    });
    if (ms) {
      return {
        ok: false,
        message: "That email already belongs to a member of this workspace.",
      };
    }
  }

  // Refuse if there's a still-valid pending invite for the same email.
  const now = new Date();
  const pending = await db.query.workspaceInvitations.findFirst({
    where: and(
      eq(workspaceInvitations.workspaceId, workspace.id),
      eq(workspaceInvitations.email, parsed.data.email.toLowerCase()),
      eq(workspaceInvitations.status, "pending"),
      gt(workspaceInvitations.expiresAt, now),
    ),
  });
  if (pending) {
    return {
      ok: false,
      message: "An invitation for that email is already pending.",
    };
  }

  const token = makeToken();
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const [created] = await db
    .insert(workspaceInvitations)
    .values({
      workspaceId: workspace.id,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      token,
      expiresAt,
      invitedByUserId: userId,
    })
    .returning({ id: workspaceInvitations.id });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl}/invitations/${token}`;

  revalidatePath("/settings/members");
  return { ok: true, invitationId: created.id, inviteUrl };
}

/* ----------------------------------------------------------------------------
 * List pending invitations for the current workspace                        */
/* -------------------------------------------------------------------------- */

export async function listInvitations() {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");

  const rows = await db.query.workspaceInvitations.findMany({
    where: eq(workspaceInvitations.workspaceId, workspace.id),
    orderBy: [desc(workspaceInvitations.createdAt)],
    with: {
      invitedBy: { columns: { id: true, email: true, name: true } },
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    status: r.status,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    inviter: r.invitedBy,
    inviteUrl: `${baseUrl}/invitations/${r.token}`,
    isExpired: r.status === "pending" && r.expiresAt < new Date(),
  }));
}

/* ----------------------------------------------------------------------------
 * Revoke an invitation                                                       */
/* -------------------------------------------------------------------------- */

export async function revokeInvitation(invitationId: string): Promise<void> {
  const { workspace } = await getCurrentWorkspace();
  await requireRole(workspace.id, "admin");

  await db
    .update(workspaceInvitations)
    .set({ status: "revoked" })
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.workspaceId, workspace.id),
        eq(workspaceInvitations.status, "pending"),
      ),
    );

  revalidatePath("/settings/members");
}

/* ----------------------------------------------------------------------------
 * Look up an invitation by token (for the accept page)                       */
/* -------------------------------------------------------------------------- */

export async function getInvitationByToken(token: string) {
  return db.query.workspaceInvitations.findFirst({
    where: eq(workspaceInvitations.token, token),
    with: {
      workspace: { columns: { id: true, name: true, slug: true } },
      invitedBy: { columns: { id: true, email: true, name: true } },
    },
  });
}

/* ----------------------------------------------------------------------------
 * Accept an invitation                                                       */
/* -------------------------------------------------------------------------- */

export async function acceptInvitation(token: string): Promise<{
  ok: boolean;
  workspaceId?: string;
  message?: string;
}> {
  const userId = await requireUserId();
  const me = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!me) return { ok: false, message: "User not found." };

  const invitation = await db.query.workspaceInvitations.findFirst({
    where: eq(workspaceInvitations.token, token),
  });
  if (!invitation) return { ok: false, message: "Invitation not found." };

  if (invitation.status !== "pending") {
    return { ok: false, message: `Invitation is ${invitation.status}.` };
  }
  if (invitation.expiresAt < new Date()) {
    await db
      .update(workspaceInvitations)
      .set({ status: "expired" })
      .where(eq(workspaceInvitations.id, invitation.id));
    return { ok: false, message: "Invitation has expired." };
  }

  // Check existing membership — idempotency.
  const existingMembership = await db.query.members.findFirst({
    where: and(
      eq(members.userId, userId),
      eq(members.workspaceId, invitation.workspaceId),
    ),
  });

  await db.transaction(async (tx) => {
    if (!existingMembership) {
      await tx.insert(members).values({
        workspaceId: invitation.workspaceId,
        userId,
        role: invitation.role,
      });
    }
    await tx
      .update(workspaceInvitations)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        acceptedByUserId: userId,
      })
      .where(eq(workspaceInvitations.id, invitation.id));

    // Switch to the joined workspace immediately.
    await tx
      .insert(userPrefs)
      .values({ userId, currentWorkspaceId: invitation.workspaceId })
      .onConflictDoUpdate({
        target: userPrefs.userId,
        set: {
          currentWorkspaceId: invitation.workspaceId,
          updatedAt: new Date(),
        },
      });
  });

  revalidatePath("/", "layout");
  return { ok: true, workspaceId: invitation.workspaceId };
}

/** Convenience: accept then redirect to /. Used by the accept page form. */
export async function acceptInvitationAndRedirect(token: string): Promise<void> {
  const res = await acceptInvitation(token);
  if (!res.ok) throw new Error(res.message ?? "Couldn't accept invitation.");
  redirect("/");
}
