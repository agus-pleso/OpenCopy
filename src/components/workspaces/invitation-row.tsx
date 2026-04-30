"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  Copy,
  Check,
  Loader2,
  X,
  Mail,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { revokeInvitation } from "@/server/actions/invitations";
import { formatDistanceShort } from "@/lib/utils";

interface Invitation {
  id: string;
  email: string;
  role: "admin" | "editor" | "viewer" | "owner";
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: Date;
  createdAt: Date;
  inviter: { email: string; name: string | null } | null;
  inviteUrl: string;
  isExpired: boolean;
}

const STATUS_VARIANT = {
  pending: "warning",
  accepted: "success",
  revoked: "outline",
  expired: "muted",
} as const;

interface Props {
  invitation: Invitation;
}

export function InvitationRow({ invitation }: Props) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = React.useState(false);

  const effectiveStatus = invitation.isExpired ? "expired" : invitation.status;

  const onCopy = () => {
    navigator.clipboard.writeText(invitation.inviteUrl);
    setCopied(true);
    toast.success("Link copied.");
    setTimeout(() => setCopied(false), 1500);
  };

  const onRevoke = () => {
    startTransition(async () => {
      try {
        await revokeInvitation(invitation.id);
        toast.success("Invitation revoked.");
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <li className="grid grid-cols-[auto,1fr,auto,auto,auto] items-center gap-3 px-4 py-3 text-sm">
      <Mail className="h-3.5 w-3.5 text-[--color-muted-foreground]" />
      <div className="min-w-0">
        <p className="truncate font-medium tracking-tight">{invitation.email}</p>
        <p className="text-xs text-[--color-muted-foreground]">
          Invited {formatDistanceShort(invitation.createdAt)}
          {invitation.inviter?.email && ` by ${invitation.inviter.email}`}
        </p>
      </div>
      <Badge variant="outline" className="text-[10px] tracking-wider">
        {invitation.role}
      </Badge>
      <Badge
        variant={STATUS_VARIANT[effectiveStatus]}
        className="inline-flex items-center gap-1 text-[10px] tracking-wider"
      >
        {effectiveStatus === "pending" && <Clock className="h-2.5 w-2.5" />}
        {effectiveStatus === "expired" && (
          <AlertTriangle className="h-2.5 w-2.5" />
        )}
        {effectiveStatus}
      </Badge>
      <div className="flex items-center gap-1">
        {effectiveStatus === "pending" && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onCopy}
              aria-label="Copy invite link"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[--color-destructive] hover:text-[--color-destructive]"
              onClick={onRevoke}
              disabled={pending}
              aria-label="Revoke invitation"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
