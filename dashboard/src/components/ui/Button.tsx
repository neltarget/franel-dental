import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-[var(--shadow-ring)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-white hover:bg-primary-dark shadow-sm",
        accent: "bg-accent text-white hover:brightness-105 shadow-sm",
        outline:
          "border border-border-strong bg-card text-foreground hover:bg-surface-2 shadow-sm",
        secondary: "bg-surface-2 text-foreground hover:bg-border",
        ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        danger:
          "bg-transparent text-danger border border-transparent hover:bg-danger-soft",
      },
      size: {
        sm: "h-7 px-2.5 text-[11px] rounded-md",
        default: "h-9 px-4",
        lg: "h-10 px-5 text-[13px]",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }