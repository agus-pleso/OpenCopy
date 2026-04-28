import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/shell/command-palette";
import { SessionProvider } from "@/components/shell/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

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

  return (
    <SessionProvider>
      <TooltipProvider delayDuration={200}>
        <div className="flex h-svh overflow-hidden">
          <Sidebar workspaceName={ws.workspace.name} />
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
      </TooltipProvider>
    </SessionProvider>
  );
}
