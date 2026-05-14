import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--app-radius-md)] text-sm font-medium tracking-[-0.005em] outline-none transition-[background-color,color,border-color,box-shadow,transform,opacity] duration-150 ease-out focus-visible:[box-shadow:0_0_0_1px_var(--app-accent),0_0_0_4px_var(--app-ring)] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--app-text)] text-[var(--app-bg)] shadow-[var(--app-elevation-1)] hover:opacity-92 active:opacity-85",
        primary:
          "bg-[var(--app-accent)] text-[var(--app-accent-contrast)] shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_8px_22px_color-mix(in_srgb,var(--app-accent)_28%,transparent)] hover:bg-[var(--app-accent-hover)] active:opacity-90",
        destructive:
          "bg-[var(--app-danger)] text-white shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_8px_22px_rgba(239,68,68,0.28)] hover:opacity-92 active:opacity-85",
        outline:
          "border border-[var(--app-border)] bg-transparent text-[var(--app-text)] hover:border-[color-mix(in_srgb,var(--app-text)_20%,var(--app-border))] hover:bg-[var(--app-hover)]",
        secondary:
          "bg-[var(--app-hover)] text-[var(--app-text)] hover:bg-[var(--app-hover-strong)]",
        ghost:
          "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
        subtle:
          "bg-[var(--app-panel-2)] text-[var(--app-text)] border border-[var(--app-border)] hover:bg-[var(--app-hover-strong)] hover:border-[color-mix(in_srgb,var(--app-text)_14%,var(--app-border))]",
        link:
          "text-[var(--app-accent)] underline-offset-4 decoration-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] hover:underline hover:text-[var(--app-accent-hover)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = (asChild ? Slot : "button") as React.ElementType
    return React.createElement(Comp, {
      className: cn(buttonVariants({ variant, size, className })),
      ref,
      ...props,
    })
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
