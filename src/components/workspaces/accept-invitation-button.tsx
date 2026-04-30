"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { acceptInvitation } from "@/server/actions/invitations";

interface Props {
  token: string;
  workspaceName: string;
}

export function AcceptInvitationButton({ token, workspaceName }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onAccept = () => {
    startTransition(async () => {
      const res = await acceptInvitation(token);
      if (res.ok) {
        toast.success(`Joined ${workspaceName}.`);
        router.push("/");
        router.refresh();
      } else {
        toast.error(res.message ?? "Couldn't accept invitation.");
      }
    });
  };

  return (
    <Button onClick={onAccept} disabled={pending}>
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
      Accept and switch
    </Button>
  );
}
