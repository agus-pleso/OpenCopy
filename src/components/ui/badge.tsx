import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[--color-primary] text-[--color-primary-foreground]",
        secondary:
          "border-transparent bg-[--color-secondary] text-[--color-secondary-foreground]",
        outline:
          "border-[--color-border] text-[--color-foreground]",
        muted:
          "border-transparent bg-[--color-muted] text-[--color-muted-foreground]",
        success:
          "border-transparent bg-[--color-success]/15 text-[--color-success]",
        warning:
          "border-transparent bg-[--color-warning]/15 text-[--color-warning]",
        destructive:
          "border-transparent bg-[--color-destructive] text-[--color-destructive-foreground]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
