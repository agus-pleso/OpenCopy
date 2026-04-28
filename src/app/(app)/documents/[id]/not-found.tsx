import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DocumentNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-6 py-24 text-center">
      <h1 className="font-display text-3xl tracking-tight">Document not found</h1>
      <p className="mt-2 text-sm text-[--color-muted-foreground]">
        It may have been deleted, or it belongs to another workspace.
      </p>
      <Button asChild className="mt-6">
        <Link href="/documents">Back to documents</Link>
      </Button>
    </div>
  );
}
