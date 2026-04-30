import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
}

export function Logo({ className, showWordmark = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark className="h-7 w-7" />
      {showWordmark && (
        <span className="font-display text-[1.05rem] tracking-tight text-[var(--color-foreground)]">
          Open<span className="text-[var(--color-primary)]">Copy</span>
        </span>
      )}
    </div>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="8"
        fill="var(--color-primary)"
      />
      <path
        d="M10 11 L22 11 M10 16 L20 16 M10 21 L17 21"
        stroke="var(--color-primary-foreground)"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
