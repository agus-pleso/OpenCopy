import { eq, and } from "drizzle-orm";
import { ExternalLink } from "lucide-react";

import { db } from "@/db/client";
import { apiKeys, modelDefaults } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OpenRouterKeyForm } from "@/components/settings/api-key-form";
import { ModelDefaultsForm } from "@/components/settings/model-defaults-form";

export default async function AiSettingsPage() {
  const { workspace } = await getCurrentWorkspace();

  const [openrouter] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.workspaceId, workspace.id),
        eq(apiKeys.provider, "openrouter"),
      ),
    )
    .limit(1);

  const defaults = await db
    .select()
    .from(modelDefaults)
    .where(eq(modelDefaults.workspaceId, workspace.id));

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>AI providers</CardTitle>
          <CardDescription>
            OpenCopy routes generation through OpenRouter by default — one key
            unlocks every model from Anthropic, OpenAI, Google, Mistral, Meta,
            and more.{" "}
            <a
              href="https://openrouter.ai/models"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              Browse models
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OpenRouterKeyForm
            existing={
              openrouter
                ? {
                    last4: openrouter.last4,
                    updatedAt: openrouter.updatedAt,
                    label: openrouter.label,
                  }
                : undefined
            }
          />
          <p className="mt-4 text-xs text-[--color-muted-foreground]">
            Direct provider keys (Anthropic, OpenAI, Google, Mistral) and Ollama
            self-host land in V1.5. The provider abstraction is already in
            place — adding them is plug-and-play.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model defaults</CardTitle>
          <CardDescription>
            Each agent role uses one of these models. You can override per-run
            once the agents ship in V1.0.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModelDefaultsForm
            existing={defaults.map((d) => ({ role: d.role, modelId: d.modelId }))}
            hasKey={!!openrouter}
          />
        </CardContent>
      </Card>
    </div>
  );
}
