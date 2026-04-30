"use client";

import * as React from "react";
import { Pencil, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceCardDisplay } from "./voice-card-display";
import { VoiceCardEditor } from "./voice-card-editor";
import { AnalyzeButton } from "./analyze-button";
import type { BrandVoice } from "@/db/schema";

interface Props {
  voice: BrandVoice;
  hasSamples: boolean;
}

export function VoiceCardSection({ voice, hasSamples }: Props) {
  const [editing, setEditing] = React.useState(false);
  const isAnalyzed = !!voice.analyzedAt;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AnalyzeButton
            voiceId={voice.id}
            hasSamples={hasSamples}
            alreadyAnalyzed={isAnalyzed}
          />
          {!isAnalyzed && !editing && (
            <>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                or
              </span>
              <Button
                variant="outline"
                size="default"
                onClick={() => setEditing(true)}
              >
                <PencilLine className="h-4 w-4" /> Fill in manually
              </Button>
            </>
          )}
        </div>
        {isAnalyzed && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit voice card
          </Button>
        )}
      </div>

      {editing ? (
        <VoiceCardEditor
          voice={voice}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <VoiceCardDisplay voice={voice} locale={voice.defaultLocale} />
      )}
    </div>
  );
}
