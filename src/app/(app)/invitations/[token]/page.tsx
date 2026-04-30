import Link from "next/link";
import { Mail, AlertTriangle, Check, Sparkles, ArrowRight, X } from "lucide-react";
import { redirect } from "next/navigation";

import { getInvitationByToken } from "@/server/actions/invitations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AcceptInvitationButton } from "@/components/workspaces/accept-invitation-button";

interface PageProps {
  params: Promise<{ token: string }>;
}

const ROLE_HINT: Record<string, string> = {
  owner: "Full control of the workspace.",
  admin: "Manages members and provider keys.",
  editor: "Read/write across voices, agents, documents, library.",
  viewer: "Read-only.",
};

export default async function AcceptInvitationPage({ params }: PageProps) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return (
      <Wrapper>
        <Icon variant="warning">
          <AlertTriangle className="h-5 w-5" />
        </Icon>
        <h1 className="font-display text-3xl tracking-tight">Invitation not found</h1>
        <p className="text-pretty text-sm text-[--color-muted-foreground]">
          The link may be malformed or the invitation may have been revoked.
        </p>
        <Button asChild className="mt-4">
          <Link href="/">Back to dashboard</Link>
        </Button>
      </Wrapper>
    );
  }

  if (invitation.status === "accepted") {
    // Idempotent: send the user to the workspace.
    redirect("/");
  }

  if (invitation.status === "revoked") {
    return (
      <Wrapper>
        <Icon variant="warning">
          <X className="h-5 w-5" />
        </Icon>
        <h1 className="font-display text-3xl tracking-tight">Invitation revoked</h1>
        <p className="text-pretty text-sm text-[--color-muted-foreground]">
          This invitation was revoked by an admin. Ask them for a new link.
        </p>
        <Button asChild className="mt-4">
          <Link href="/">Back to dashboard</Link>
        </Button>
      </Wrapper>
    );
  }

  const expired =
    invitation.status === "expired" || invitation.expiresAt < new Date();

  if (expired) {
    return (
      <Wrapper>
        <Icon variant="warning">
          <AlertTriangle className="h-5 w-5" />
        </Icon>
        <h1 className="font-display text-3xl tracking-tight">Invitation expired</h1>
        <p className="text-pretty text-sm text-[--color-muted-foreground]">
          The link to <strong>{invitation.workspace?.name}</strong> expired on{" "}
          {invitation.expiresAt.toLocaleDateString()}. Ask the admin to send a
          new one.
        </p>
        <Button asChild className="mt-4">
          <Link href="/">Back to dashboard</Link>
        </Button>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Icon variant="success">
        <Sparkles className="h-5 w-5" />
      </Icon>
      <p className="text-xs uppercase tracking-[0.18em] text-[--color-muted-foreground]">
        You&apos;re invited
      </p>
      <h1 className="font-display text-3xl tracking-tight md:text-4xl text-balance">
        Join {invitation.workspace?.name}
      </h1>
      <p className="text-pretty text-sm text-[--color-muted-foreground]">
        {invitation.invitedBy?.name || invitation.invitedBy?.email} invited you
        to join as{" "}
        <Badge variant="outline" className="text-[10px] tracking-wider capitalize">
          {invitation.role}
        </Badge>{" "}
        — {ROLE_HINT[invitation.role]}
      </p>
      <div className="mt-2 flex items-center gap-2 rounded-md border border-[--color-border] bg-[--color-muted]/40 px-3 py-2 text-xs text-[--color-muted-foreground]">
        <Mail className="h-3.5 w-3.5" />
        <span className="truncate">Invitation labeled for {invitation.email}</span>
      </div>
      <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row">
        <AcceptInvitationButton
          token={token}
          workspaceName={invitation.workspace?.name ?? ""}
        />
        <Button asChild variant="outline">
          <Link href="/">
            <X className="h-3.5 w-3.5" /> Not now
          </Link>
        </Button>
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-24 text-center">
      {children}
    </div>
  );
}

function Icon({
  variant,
  children,
}: {
  variant: "success" | "warning";
  children: React.ReactNode;
}) {
  const cls =
    variant === "success"
      ? "bg-[--color-primary]/10 text-[--color-primary]"
      : "bg-[--color-warning]/10 text-[--color-warning]";
  return (
    <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${cls}`}>
      {children}
    </div>
  );
}

// Suppress unused imports warning for cleaner future use.
void ArrowRight;
void Check;
