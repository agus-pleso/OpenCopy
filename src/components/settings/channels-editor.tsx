"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  reorderChannelDefinitions,
  updateChannelDefinition,
} from "@/server/actions/channels";
import type {
  ChannelComponent,
  ChannelComponentType,
  ChannelDefinition,
} from "@/db/schema";

interface Props {
  initial: ChannelDefinition[];
}

const TYPE_OPTIONS: { value: ChannelComponentType; label: string }[] = [
  { value: "short", label: "Short — single line" },
  { value: "long", label: "Long — multi-paragraph" },
  { value: "cta", label: "CTA — button copy" },
];

/**
 * Settings → Channels editor. Two layers:
 *
 *  - Outer list: reorder channels (up/down buttons) — drag-and-drop is
 *    deferred to a polish pass, this ships the user-visible behavior with
 *    less surface area.
 *  - Per-channel expand: edit the label and the component schema. Each
 *    component card lets the user rewrite the id, label, type, required
 *    flag, hint, maxLength, and optional per-component prompt override.
 *
 * Saves go through the existing `updateChannelDefinition` server action
 * (which also revalidates `/settings/channels`).
 */
export function ChannelsEditor({ initial }: Props) {
  const router = useRouter();
  const [defs, setDefs] = React.useState(initial);
  const [reordering, startReorder] = useTransition();

  const move = (id: string, direction: "up" | "down") => {
    const idx = defs.findIndex((d) => d.id === id);
    if (idx < 0) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= defs.length) return;
    const next = [...defs];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    setDefs(next);
    startReorder(async () => {
      const res = await reorderChannelDefinitions({
        orderedIds: next.map((d) => d.id),
      });
      if ("ok" in res && !res.ok) {
        toast.error(res.message);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {defs.map((def, idx) => (
        <ChannelRow
          key={def.id}
          def={def}
          isFirst={idx === 0}
          isLast={idx === defs.length - 1}
          onMoveUp={() => move(def.id, "up")}
          onMoveDown={() => move(def.id, "down")}
          reordering={reordering}
        />
      ))}
    </div>
  );
}

interface RowProps {
  def: ChannelDefinition;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  reordering: boolean;
}

function ChannelRow({ def, isFirst, isLast, onMoveUp, onMoveDown, reordering }: RowProps) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [label, setLabel] = React.useState(def.label);
  const [components, setComponents] = React.useState<ChannelComponent[]>(
    def.components,
  );
  const [saving, startSave] = useTransition();

  const dirty =
    label !== def.label ||
    JSON.stringify(components) !== JSON.stringify(def.components);

  // Re-sync local state if the definition prop changes (e.g. after reorder
  // refresh). Without this, opening a row that was just moved would still
  // show the previous values.
  React.useEffect(() => {
    setLabel(def.label);
    setComponents(def.components);
  }, [def.label, def.components]);

  const onSave = () => {
    // Validate component ids unique + non-empty.
    const ids = components.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      toast.error("Component ids must be unique within a channel.");
      return;
    }
    if (ids.some((id) => !id || !/^[a-z][a-z0-9_]*$/.test(id))) {
      toast.error("Component ids must be snake_case (e.g. `subject`, `cta_primary`).");
      return;
    }
    startSave(async () => {
      const res = await updateChannelDefinition({
        id: def.id,
        label,
        components,
      });
      if ("ok" in res && !res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`${label} saved.`);
      router.refresh();
    });
  };

  const updateComponent = (idx: number, patch: Partial<ChannelComponent>) => {
    setComponents((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  };

  const addComponent = () => {
    if (components.length >= 12) {
      toast.error("Max 12 components per channel.");
      return;
    }
    const baseId = `field_${components.length + 1}`;
    setComponents((prev) => [
      ...prev,
      {
        id: baseId,
        label: "New field",
        type: "short",
        required: false,
      },
    ]);
  };

  const removeComponent = (idx: number) => {
    setComponents((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveComponent = (idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= components.length) return;
    setComponents((prev) => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  return (
    <div
      className={
        "rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] " +
        (expanded ? "shadow-sm" : "")
      }
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--color-muted)]/30"
      >
        <GripVertical className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]/60" />
        <ChevronRight
          className={
            "h-3.5 w-3.5 text-[var(--color-muted-foreground)] transition-transform " +
            (expanded ? "rotate-90" : "")
          }
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium tracking-tight">{def.label}</span>
            <Badge variant="muted" className="font-mono text-[10px] tracking-wider">
              {def.channelId}
            </Badge>
            <span className="text-[11px] text-[var(--color-muted-foreground)]">
              {def.components.length} component{def.components.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={isFirst || reordering}
            onClick={onMoveUp}
            aria-label="Move up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={isLast || reordering}
            onClick={onMoveDown}
            aria-label="Move down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border)] p-4">
          <div className="mb-4 flex flex-col gap-1.5">
            <Label htmlFor={`label-${def.id}`}>Display label</Label>
            <Input
              id={`label-${def.id}`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
            />
          </div>
          <div className="flex flex-col gap-3">
            {components.map((c, idx) => (
              <ComponentEditor
                key={idx}
                component={c}
                idx={idx}
                isFirst={idx === 0}
                isLast={idx === components.length - 1}
                onChange={(patch) => updateComponent(idx, patch)}
                onRemove={() => removeComponent(idx)}
                onMoveUp={() => moveComponent(idx, "up")}
                onMoveDown={() => moveComponent(idx, "down")}
              />
            ))}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={addComponent}>
                <Plus className="h-3.5 w-3.5" /> Add component
              </Button>
              <Button onClick={onSave} disabled={!dirty || saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save channel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ComponentEditorProps {
  component: ChannelComponent;
  idx: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<ChannelComponent>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ComponentEditor({
  component,
  idx,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: ComponentEditorProps) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          #{idx + 1}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            disabled={isFirst}
            onClick={onMoveUp}
            aria-label="Move up"
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            disabled={isLast}
            onClick={onMoveDown}
            aria-label="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-[var(--color-destructive)]"
            onClick={onRemove}
            aria-label="Remove component"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Id (snake_case, stable)</Label>
          <Input
            value={component.id}
            onChange={(e) => onChange({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
            placeholder="subject"
            className="font-mono text-xs"
            maxLength={40}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Label (display)</Label>
          <Input
            value={component.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Subject"
            maxLength={60}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Type</Label>
          <Select
            value={component.type}
            onValueChange={(v) => onChange({ type: v as ChannelComponentType })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Max length (chars)</Label>
          <Input
            type="number"
            min={1}
            max={20000}
            value={component.maxLength ?? ""}
            onChange={(e) => {
              const n = e.target.value === "" ? undefined : Number(e.target.value);
              onChange({ maxLength: Number.isFinite(n) ? (n as number) : undefined });
            }}
            placeholder="(none)"
          />
        </div>
        <label className="col-span-1 flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={component.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
          />
          <span>Required (drafter must produce a non-empty value)</span>
        </label>
        <div className="col-span-1 flex flex-col gap-1 sm:col-span-2">
          <Label className="text-xs">Hint (shown in UI + sent to drafter)</Label>
          <Input
            value={component.hint ?? ""}
            onChange={(e) => onChange({ hint: e.target.value || undefined })}
            placeholder="e.g. < 60 chars, action verb"
            maxLength={240}
          />
        </div>
        <div className="col-span-1 flex flex-col gap-1 sm:col-span-2">
          <Label className="text-xs">
            Per-component prompt override (advanced)
          </Label>
          <Textarea
            value={component.prompt ?? ""}
            onChange={(e) => onChange({ prompt: e.target.value || undefined })}
            placeholder="Optional: replace the drafter's generic per-type instruction for this component."
            className="min-h-[60px]"
            maxLength={800}
          />
        </div>
      </div>
    </div>
  );
}
