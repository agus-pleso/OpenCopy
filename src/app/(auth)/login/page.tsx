import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { SignInForm } from "@/components/auth/sign-in-form";

interface LoginPageProps {
  searchParams: Promise<{ from?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user?.id) redirect(params.from ?? "/");

  const devEnabled = process.env.DEV_AUTH_ENABLED === "true";
  const resendEnabled = !!process.env.AUTH_RESEND_KEY;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl tracking-tight">Sign in</h1>
        <p className="text-sm text-[--color-muted-foreground]">
          Welcome back. Pick up where you left off.
        </p>
      </div>

      <SignInForm
        devEnabled={devEnabled}
        resendEnabled={resendEnabled}
        from={params.from}
        error={params.error}
      />

      <p className="text-xs text-[--color-muted-foreground] text-pretty">
        By continuing you agree that copy you generate may be processed by your
        configured model providers. OpenCopy itself stores nothing on third-party
        servers.{" "}
        <Link href="/" className="underline underline-offset-2">
          Learn more
        </Link>
      </p>
    </div>
  );
}
