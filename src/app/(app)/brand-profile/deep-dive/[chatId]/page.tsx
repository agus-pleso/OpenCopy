import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquareQuote, ScanText, Languages } from "lucide-react";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { brandProfileChatMessages, brandProfileChats } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { DeepDiveChat } from "./deep-dive-chat";

interface PageProps {
  params: Promise<{ chatId: string }>;
}

export default async function DeepDivePage({ params }: PageProps) {
  const { chatId } = await params;
  const { workspace } = await getCurrentWorkspace();

  const chat = await db.query.brandProfileChats.findFirst({
    where: and(
      eq(brandProfileChats.id, chatId),
      eq(brandProfileChats.workspaceId, workspace.id),
    ),
  });
  if (!chat) notFound();
  if (chat.kind === "onboarding") notFound();

  const messages = await db.query.brandProfileChatMessages.findMany({
    where: eq(brandProfileChatMessages.chatId, chat.id),
    orderBy: [asc(brandProfileChatMessages.createdAt)],
  });

  const isSeo = chat.kind === "seo_deep_dive";

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10 md:py-14">
      <Link
        href="/settings/brand-profile"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-3 w-3" /> Back to settings
      </Link>

      <header className="mt-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          {isSeo ? (
            <ScanText className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          ) : (
            <Languages className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          )}
          {isSeo ? "SEO" : "Localizer"} deep-dive
          {chat.locale && (
            <span className="ml-1 rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px] font-mono uppercase">
              {chat.locale}
            </span>
          )}
        </div>
        <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl">
          {isSeo
            ? "Tell me about your search strategy."
            : "Tell me how this locale should feel."}
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
          <MessageSquareQuote className="mr-1 inline h-3.5 w-3.5" />A short chat — I&apos;ll
          fold the answers into your brand profile.
        </p>
      </header>

      <div className="mt-8">
        <DeepDiveChat chat={chat} initialMessages={messages} />
      </div>
    </div>
  );
}
