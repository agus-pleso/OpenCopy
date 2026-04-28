"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { Loader2, Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface Props {
  devEnabled: boolean;
  resendEnabled: boolean;
  from?: string;
  error?: string;
}

export function SignInForm({ devEnabled, resendEnabled, from, error }: Props) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submittingEmail, setSubmittingEmail] = React.useState(false);
  const [submittingDev, setSubmittingDev] = React.useState(false);

  React.useEffect(() => {
    if (error) {
      toast.error(error === "CredentialsSignin" ? "Invalid email or password." : error);
    }
  }, [error]);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmittingEmail(true);
    try {
      const res = await signIn("resend", {
        email,
        callbackUrl: from ?? "/",
        redirect: false,
      });
      if (res?.error) {
        toast.error(res.error);
      } else {
        router.push("/login/verify");
      }
    } finally {
      setSubmittingEmail(false);
    }
  };

  const handleDev = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmittingDev(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        toast.error("Invalid email or password.");
      } else {
        router.push(from ?? "/");
        router.refresh();
      }
    } finally {
      setSubmittingDev(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {resendEnabled && (
        <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="magic-email">Work email</Label>
            <Input
              id="magic-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={submittingEmail || !email}>
            {submittingEmail ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Send magic link
          </Button>
        </form>
      )}

      {resendEnabled && devEnabled && (
        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[--color-background] px-2 text-xs uppercase tracking-wider text-[--color-muted-foreground]">
            or
          </span>
        </div>
      )}

      {devEnabled && (
        <form onSubmit={handleDev} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="dev-email" className="flex items-center gap-2">
              Dev sign-in
              <span className="text-[10px] uppercase tracking-wider rounded-full bg-[--color-warning]/15 text-[--color-warning] px-1.5 py-0.5">
                local
              </span>
            </Label>
          </div>
          <Input
            id="dev-email"
            type="email"
            autoComplete="email"
            placeholder="any@email.dev"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            id="dev-password"
            type="password"
            autoComplete="current-password"
            placeholder="any password (≥6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <Button
            type="submit"
            variant={resendEnabled ? "outline" : "default"}
            disabled={submittingDev || !email || password.length < 6}
          >
            {submittingDev ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            Sign in
          </Button>
          <p className="text-xs text-[--color-muted-foreground] text-pretty">
            First sign-in creates the account automatically. Disable in production
            with <code className="font-mono text-[11px]">DEV_AUTH_ENABLED=false</code>.
          </p>
        </form>
      )}

      {!resendEnabled && !devEnabled && (
        <p className="rounded-md border border-[--color-border] bg-[--color-muted] p-4 text-sm text-[--color-muted-foreground]">
          No auth providers are configured. Set <code className="font-mono">AUTH_RESEND_KEY</code>{" "}
          for magic links, or <code className="font-mono">DEV_AUTH_ENABLED=true</code> for the
          local dev provider.
        </p>
      )}
    </div>
  );
}
