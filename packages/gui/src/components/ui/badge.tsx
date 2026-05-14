import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase leading-5 tracking-[0.06em] tabular-nums transition-[background-color,color,border-color] duration-150",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--app-text)] text-[var(--app-bg)]",
        secondary:
          "border-[var(--app-border)] bg-[var(--app-hover)] text-[var(--app-muted)]",
        outline:
          "border-[var(--app-border)] bg-transparent text-[var(--app-muted)]",
        accent:
          "border-transparent bg-[var(--app-accent-soft)] text-[var(--app-accent)]",
        success:
          "border-transparent bg-[color-mix(in_srgb,var(--app-success)_16%,transparent)] text-[var(--app-success)]",
        warning:
          "border-transparent bg-[color-mix(in_srgb,var(--app-warning)_16%,transparent)] text-[var(--app-warning)]",
        destructive:
          "border-transparent bg-[var(--app-danger-soft)] text-[var(--app-danger)]",
        info:
          "border-transparent bg-[var(--app-accent-soft)] text-[var(--app-accent)]",
        dot:
          "border-[var(--app-border)] bg-[var(--app-panel-2)] text-[var(--app-muted)] before:mr-1 before:inline-block before:h-1.5 before:w-1.5 before:rounded-full before:bg-current before:content-['']",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
