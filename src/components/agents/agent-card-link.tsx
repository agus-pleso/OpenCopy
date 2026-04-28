import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  description: string;
  steps: string[];
  disabled?: boolean;
  badge?: string;
}

export function AgentCardLink({
  href,
  icon: Icon,
  name,
  description,
  steps,
  disabled,
  badge,
}: Props) {
  const inner = (
    <div
      className={cn(
        "group relative h-full overflow-hidden rounded-2xl border border-[--color-border] bg-[--color-card] p-6 transition",
        !disabled &&
          "hover:border-[--color-primary]/40 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]",
        disabled && "opacity-60",
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[--color-primary] via-[--color-primary]/60 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[--color-primary]/10 text-[--color-primary]">
          <Icon className="h-5 w-5" />
        </div>
        {badge && (
          <span className="inline-flex items-center rounded-full bg-[--color-muted] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[--color-muted-foreground]">
            {badge}
          </span>
        )}
      </div>
      <h3 className="mt-5 font-display text-2xl tracking-tight">{name}</h3>
      <p className="mt-2 text-pretty text-sm text-[--color-muted-foreground]">
        {description}
      </p>
      <ol className="mt-5 flex flex-col gap-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2.5 text-sm">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[--color-border] text-[10px] font-mono text-[--color-muted-foreground]">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {!disabled && (
        <div className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-[--color-primary]">
          Start a run
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      )}
    </div>
  );
  return disabled ? <div>{inner}</div> : <Link href={href}>{inner}</Link>;
}
