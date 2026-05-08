import { listChannelDefinitions } from "@/server/actions/channels";
import { ChannelsEditor } from "@/components/settings/channels-editor";

export default async function ChannelsSettingsPage() {
  const definitions = await listChannelDefinitions();
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-2xl tracking-tight">Channels</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted-foreground)] text-pretty">
          Each channel has a list of components the copywriter agent fills
          in when drafting. Reorder, rename, or rewrite them — the agent
          uses the schema below verbatim. Existing campaigns keep working
          either way; the new structure only applies to assets generated
          after a change.
        </p>
      </div>
      <ChannelsEditor initial={definitions} />
    </div>
  );
}
