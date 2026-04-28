import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VerifyPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[--color-primary]/10 text-[--color-primary]">
        <Mail className="h-5 w-5" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl tracking-tight">
          Check your inbox.
        </h1>
        <p className="text-sm text-[--color-muted-foreground] text-pretty">
          We sent you a sign-in link. It expires in 10 minutes. You can close
          this tab — the link will open you back here.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/login">Use a different method</Link>
      </Button>
    </div>
  );
}
