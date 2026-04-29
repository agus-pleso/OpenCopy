import { eq, and, inArray } from "drizzle-orm";
import { ExternalLink, BookOpen, Server, Sparkles } from "lucide-react";

import { db } from "@/db/client";
import { apiKeys, modelDefaults, type ApiKeyProvider } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/workspace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OpenRouterKeyForm } from "@/components/settings/api-key-form";
import { OpenAIKeyForm } from "@/components/settings/openai-key-form";
import { ProviderKeyForm } from "@/components/settings/provider-key-form";
import { OllamaConfigForm } from "@/components/settings/ollama-config-form";
import { ModelDefaultsForm } from "@/components/settings/model-defaults-form";

export default async function AiSettingsPage() {
  const { workspace } = await getCurrentWorkspace();

  const allKeys = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.workspaceId, workspace.id),
        inArray(apiKeys.provider, [
          "openrouter",
          "anthropic",
          "openai",
          "google",
          "mistral",
          "ollama",
        ] satisfies ApiKeyProvider[]),
      ),
    );

  const byProvider = new Map(allKeys.map((k) => [k.provider, k]));
  const get = (p: ApiKeyProvider) => byProvider.get(p);

  const defaults = await db
    .select()
    .from(modelDefaults)
    .where(eq(modelDefaults.workspaceId, workspace.id));

  const openrouter = get("openrouter");
  const anthropic = get("anthropic");
  const openai = get("openai");
  const google = get("google");
  const mistral = get("mistral");
  const ollama = get("ollama");

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>AI providers</CardTitle>
          <CardDescription>
            OpenRouter is the default gateway — one key, every model. Direct
            keys skip the markup for high-volume calls; Ollama runs everything
            on your network.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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

          <details className="group rounded-lg border border-[--color-border]">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium tracking-tight transition hover:bg-[--color-accent] flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[--color-primary]" />
              Direct provider keys
              <span className="ml-auto text-[11px] uppercase tracking-wider text-[--color-muted-foreground]">
                {[anthropic, openai, google, mistral].filter(Boolean).length}{" "}
                connected
              </span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-[--color-border] p-4">
              <p className="text-xs text-[--color-muted-foreground] text-pretty">
                Skip OpenRouter&apos;s markup for any role you route through
                these. Set the routing override per-role under <em>Model
                defaults</em> below.
              </p>
              <ProviderKeyForm
                provider="anthropic"
                title="Anthropic"
                helper={
                  <>
                    Direct route for Claude (Opus / Sonnet / Haiku). Get a key
                    at{" "}
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      console.anthropic.com
                    </a>
                    .
                  </>
                }
                placeholder="sk-ant-…"
                defaultLabel="Anthropic · direct"
                badgeText="Direct"
                existing={
                  anthropic
                    ? {
                        last4: anthropic.last4,
                        updatedAt: anthropic.updatedAt,
                        label: anthropic.label,
                      }
                    : undefined
                }
              />
              <ProviderKeyForm
                provider="google"
                title="Google"
                helper={
                  <>
                    Direct route for Gemini (Flash / Pro). Get a key at{" "}
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      aistudio.google.com
                    </a>
                    .
                  </>
                }
                placeholder="AIza…"
                defaultLabel="Google · direct"
                badgeText="Direct"
                existing={
                  google
                    ? {
                        last4: google.last4,
                        updatedAt: google.updatedAt,
                        label: google.label,
                      }
                    : undefined
                }
              />
              <ProviderKeyForm
                provider="mistral"
                title="Mistral"
                helper={
                  <>
                    Direct route for Mistral models. Get a key at{" "}
                    <a
                      href="https://console.mistral.ai/api-keys/"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      console.mistral.ai
                    </a>
                    .
                  </>
                }
                placeholder="…"
                defaultLabel="Mistral · direct"
                badgeText="Direct"
                existing={
                  mistral
                    ? {
                        last4: mistral.last4,
                        updatedAt: mistral.updatedAt,
                        label: mistral.label,
                      }
                    : undefined
                }
              />
            </div>
          </details>

          <details className="group rounded-lg border border-[--color-border]">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium tracking-tight transition hover:bg-[--color-accent] flex items-center gap-2">
              <Server className="h-3.5 w-3.5 text-[--color-primary]" />
              Ollama (local / air-gapped)
              {ollama && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[--color-success]">
                  Configured
                </span>
              )}
            </summary>
            <div className="border-t border-[--color-border] p-4">
              <OllamaConfigForm
                existing={
                  ollama
                    ? { baseUrl: ollama.baseUrl, updatedAt: ollama.updatedAt }
                    : undefined
                }
              />
            </div>
          </details>

          <p className="text-xs text-[--color-muted-foreground] text-pretty">
            <a
              href="https://openrouter.ai/models"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              Browse OpenRouter models
              <ExternalLink className="h-3 w-3" />
            </a>{" "}
            — use these ids in Model defaults below.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Embeddings</CardTitle>
              <CardDescription>
                The knowledge base uses OpenAI&apos;s{" "}
                <code className="font-mono text-xs">text-embedding-3-small</code>{" "}
                to vectorize chunks. Voyage and Cohere embeddings (better
                multilingual quality for PL/RO/UA) land in V1.6.
              </CardDescription>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[--color-primary]/10 text-[--color-primary]">
              <BookOpen className="h-4 w-4" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <OpenAIKeyForm
            existing={
              openai
                ? {
                    last4: openai.last4,
                    updatedAt: openai.updatedAt,
                    label: openai.label,
                  }
                : undefined
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model defaults</CardTitle>
          <CardDescription>
            Each agent role uses one of these models. Direct providers + Ollama
            can be selected per-role to bypass OpenRouter when desired.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModelDefaultsForm
            existing={defaults.map((d) => ({
              role: d.role,
              modelId: d.modelId,
              provider: d.provider,
            }))}
            hasKey={!!openrouter}
            connectedProviders={{
              openrouter: !!openrouter,
              anthropic: !!anthropic,
              openai: !!openai,
              google: !!google,
              mistral: !!mistral,
              ollama: !!ollama,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
