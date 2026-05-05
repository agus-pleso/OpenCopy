import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { userPrefs, users } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { listMyWorkspaces } from "@/server/actions/workspaces";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/shell/command-palette";
import { SessionProvider } from "@/components/shell/session-provider";
import { NavProgress } from "@/components/shell/nav-progress";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TourRunner } from "@/components/tours/tour-runner";

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

  return (
    <SessionProvider>
      <TooltipProvider delayDuration={200}>
        <TourRunner initialCompleted={prefs?.toursCompleted ?? {}}>
          <NavProgress />
          <div className="flex h-svh overflow-hidden">
            <Sidebar
              currentWorkspace={{ id: ws.workspace.id, name: ws.workspace.name }}
              workspaces={myWorkspaces}
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
          </div>
        </TourRunner>
      </TooltipProvider>
    </SessionProvider>
  );
}
