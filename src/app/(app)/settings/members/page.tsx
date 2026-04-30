import { Users, AlertCircle } from "lucide-react";

import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { listMembers } from "@/server/actions/members";
import { listInvitations } from "@/server/actions/invitations";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InviteMemberDialog } from "@/components/workspaces/invite-member-dialog";
import { MemberRow } from "@/components/workspaces/member-row";
import { InvitationRow } from "@/components/workspaces/invitation-row";

export default async function MembersPage() {
  const { role } = await getCurrentWorkspace();
  const canManage = role === "owner" || role === "admin";

  const [members, invitations] = await Promise.all([
    listMembers(),
    canManage ? listInvitations() : Promise.resolve([]),
  ]);

  const pending = invitations.filter(
    (i) => i.status === "pending" && !i.isExpired,
  );
  const past = invitations.filter(
    (i) => i.status !== "pending" || i.isExpired,
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Members</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            People with access to this workspace and their roles.
          </p>
        </div>
        {canManage && <InviteMemberDialog />}
      </div>

      {!canManage && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            You&apos;re a {role} — you can see members but not change roles or
            invite new people.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                <Users className="inline mr-2 h-4 w-4 align-[-2px]" />
                Members
              </CardTitle>
              <CardDescription>{members.length} total</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <ul className="flex flex-col divide-y divide-[var(--color-border)]">
            {members.map((m) => (
              <MemberRow key={m.memberId} member={m} actorRole={role} />
            ))}
          </ul>
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>
              Magic links waiting to be accepted. Expire 7 days after creation.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {pending.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-[var(--color-muted-foreground)]">
                No pending invitations.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--color-border)]">
                {pending.map((i) => (
                  <InvitationRow key={i.id} invitation={i} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {canManage && past.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past invitations</CardTitle>
            <CardDescription>
              Accepted, revoked, or expired. Kept for audit.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <ul className="flex flex-col divide-y divide-[var(--color-border)]">
              {past.slice(0, 20).map((i) => (
                <InvitationRow key={i.id} invitation={i} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
