import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium outline-none transition-[background-color,color,border-color,opacity] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--app-accent)] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--app-text)] text-[var(--app-bg)] hover:opacity-90 active:opacity-80",
        primary:
          "bg-[var(--app-accent)] text-[var(--app-accent-contrast)] hover:opacity-90 active:opacity-85",
        destructive:
          "bg-[var(--app-danger)] text-white hover:opacity-90 active:opacity-85",
        outline:
          "border border-[var(--app-border)] bg-transparent text-[var(--app-text)] hover:bg-[var(--app-hover)]",
        secondary:
          "bg-[var(--app-hover)] text-[var(--app-text)] hover:bg-[var(--app-hover-strong)]",
        ghost:
          "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
        subtle:
          "bg-[var(--app-panel-2)] text-[var(--app-text)] hover:bg-[var(--app-hover-strong)]",
        link: "text-[var(--app-accent)] underline-offset-4 hover:underline",
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
    const Comp = asChild ? Slot : "button"
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
