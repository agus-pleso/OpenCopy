import { Building2 } from "lucide-react";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Edit landing in V1.6.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end">
            <Button disabled variant="outline" size="sm">
              Editing lands in V1.6
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Invite teammates and assign roles. Lands in V1.6 — for now you&apos;re
            flying solo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3 text-sm">
            <span>Multi-user invitations · roles · permissions</span>
            <Badge variant="muted">V1.6</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
