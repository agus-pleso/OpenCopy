import { Sparkles } from "lucide-react";
import Link from "next/link";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { brandProfileChatMessages } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import {
  getOrCreateBrandProfile,
  startOnboardingChat,
} from "@/server/actions/brand-profile";
import { OnboardingChat } from "@/components/brand-profile/onboarding-chat";

const ONBOARDING_TURN_BUDGET = 20;

/**
 * Onboarding page — auto-triggered when no completed brand profile exists.
 * Sits outside the typical content-density rhythm — extra padding, generous
 * type, the "first impression" surface per the design memory.
 */
export default async function OnboardingPage() {
  // Ensure a profile exists; start (or resume) an active onboarding chat.
  await getOrCreateBrandProfile();
  const { chatId } = await startOnboardingChat();

  const { workspace } = await getCurrentWorkspace();

  // Load the chat row + its messages directly from the DB so the page renders
  // against real data on first paint. The server-action `reopenChat` does
  // essentially the same thing but adds an unnecessary RPC layer here.
  const chat = await db.query.brandProfileChats.findFirst({
    where: (t, { eq, and }) =>
      and(eq(t.id, chatId), eq(t.workspaceId, workspace.id)),
  });
  if (!chat) {
    // Shouldn't happen — startOnboardingChat just inserted it. Defensive.
    throw new Error("Onboarding chat missing.");
  }

  const messages = await db.query.brandProfileChatMessages.findMany({
    where: eq(brandProfileChatMessages.chatId, chat.id),
    orderBy: [asc(brandProfileChatMessages.createdAt)],
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 md:py-14">
      <header>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary)]" />
          Brand onboarding
        </div>
        <h1 className="mt-3 font-display text-4xl tracking-tight md:text-5xl text-balance">
          Tell me about your brand.
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-[var(--color-muted-foreground)]">
          I&apos;ll ask a few questions about your voice, audience, positioning, and
          product. Every answer feeds the AI that&apos;ll draft for you. Skip a question
          with a one-word answer if it doesn&apos;t fit.
        </p>
        <p className="mt-3 text-sm">
          <Link
            href="/onboarding/extract"
            className="text-[var(--color-primary)] underline-offset-2 hover:underline"
          >
            Prefer to paste a URL?
          </Link>{" "}
          <span className="text-[var(--color-muted-foreground)]">
            We&apos;ll crawl your site and propose a profile.
          </span>
        </p>
      </header>

      <div className="mt-10">
        <OnboardingChat
          chat={chat}
          initialMessages={messages}
          totalTurnBudget={ONBOARDING_TURN_BUDGET}
        />
      </div>
    </div>
  );
}
