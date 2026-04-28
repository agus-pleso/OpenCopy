"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
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
      <div className="flex items-center justify-between gap-3">
        <AnalyzeButton
          voiceId={voice.id}
          hasSamples={hasSamples}
          alreadyAnalyzed={isAnalyzed}
        />
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
