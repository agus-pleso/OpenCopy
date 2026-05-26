import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/auth";
import { db } from "@/db/client";
import { brandVoices, kbSources, userPrefs, users } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { listMyWorkspaces } from "@/server/actions/workspaces";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/shell/command-palette";
import { SessionProvider } from "@/components/shell/session-provider";
import { NavProgress } from "@/components/shell/nav-progress";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TourRunner } from "@/components/tours/tour-runner";
import { NlCommandPalette } from "@/components/brand-profile/nl-command-palette";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!user) redirect("/login");

  let ws;
  try {
    ws = await getCurrentWorkspace();
  } catch {
    redirect("/login");
  }

  const myWorkspaces = await listMyWorkspaces();
  const prefs = await db.query.userPrefs.findFirst({
    where: eq(userPrefs.userId, user.id),
  });

  // Voices + knowledge sources for the sidebar's "+ New" entry dialog.
  // Cheap queries (small N), runs on every navigation but the layout is
  // already streaming on workspace + prefs.
  const [voicesForSidebar, sourcesForSidebar] = await Promise.all([
    db
      .select({
        id: brandVoices.id,
        name: brandVoices.name,
        analyzedAt: brandVoices.analyzedAt,
      })
      .from(brandVoices)
      .where(eq(brandVoices.workspaceId, ws.workspace.id)),
    db
      .select({
        id: kbSources.id,
        name: kbSources.name,
        chunkCount: kbSources.chunkCount,
        status: kbSources.status,
      })
      .from(kbSources)
      .where(
        and(
          eq(kbSources.workspaceId, ws.workspace.id),
          eq(kbSources.status, "ready"),
        ),
      ),
  ]);

  return (
    <SessionProvider>
      <TooltipProvider delayDuration={200}>
        <TourRunner initialCompleted={prefs?.toursCompleted ?? {}}>
          <NavProgress />
          <div className="flex h-svh overflow-hidden">
            <Sidebar
              currentWorkspace={{ id: ws.workspace.id, name: ws.workspace.name }}
              workspaces={myWorkspaces}
              voices={voicesForSidebar.map((v) => ({
                id: v.id,
                name: v.name,
                isAnalyzed: !!v.analyzedAt,
              }))}
              sources={sourcesForSidebar.map((s) => ({
                id: s.id,
                name: s.name,
                chunkCount: s.chunkCount,
                status: s.status,
              }))}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar
                user={{ email: user.email, name: user.name }}
                workspaceName={ws.workspace.name}
                role={ws.role}
              />
              <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
            <CommandPalette />
            <NlCommandPalette />
          </div>
        </TourRunner>
      </TooltipProvider>
    </SessionProvider>
  );
}
