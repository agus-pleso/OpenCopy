import { Building2, Package } from "lucide-react";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExportWorkspaceDialog } from "@/components/workspaces/export-workspace-dialog";
import { ImportWorkspaceDialog } from "@/components/workspaces/import-workspace-dialog";

export default async function WorkspaceSettingsPage() {
  const { workspace, role } = await getCurrentWorkspace();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Workspace</CardTitle>
              <CardDescription>
                Your role: <span className="capitalize">{role}</span>
              </CardDescription>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-2 md:grid-cols-2 md:gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ws-name">Name</Label>
              <Input id="ws-name" defaultValue={workspace.name} disabled />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ws-slug">Slug</Label>
              <Input id="ws-slug" defaultValue={workspace.slug} disabled />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Default locale</Label>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">{workspace.defaultLocale}</Badge>
            </div>
          </div>
          <div className="flex items-center justify-end">
            <Button disabled variant="outline" size="sm">
              Edit
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Transfer</CardTitle>
              <CardDescription>
                Export this workspace to a single <code>.opencopy</code> file
                you can hand to a teammate, or import one to spin up a new
                workspace from someone else&apos;s export.
              </CardDescription>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Package className="h-4 w-4" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">Export workspace</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {role === "owner"
                  ? "Bundles voices, knowledge, runs, documents, and campaigns. API keys and members are excluded."
                  : "Only the owner can export."}
              </p>
            </div>
            {role === "owner" ? (
              <ExportWorkspaceDialog />
            ) : (
              <Button variant="outline" size="sm" disabled>
                Owner only
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">Import workspace</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Creates a brand-new workspace from an <code>.opencopy</code>{" "}
                file. You become its sole owner.
              </p>
            </div>
            <ImportWorkspaceDialog />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Invite teammates and assign roles. For now you&apos;re flying solo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3 text-sm">
            <span>Multi-user invitations · roles · permissions</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
