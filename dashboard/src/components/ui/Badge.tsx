import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full h-5 px-2.5 text-[11px] font-semibold whitespace-nowrap leading-none",
  {
    variants: {
      variant: {
        teal: "bg-primary-soft text-primary",
        blue: "bg-info-soft text-info",
        gold: "bg-warning-soft text-warning",
        red: "bg-danger-soft text-danger",
        green: "bg-success-soft text-success",
        violet: "bg-violet-soft text-violet",
        neutral: "bg-surface-2 text-muted",
        "solid-green": "bg-success text-white",
        "solid-orange": "bg-warning text-white",
      },
      dot: {
        true: "",
        false: "",
      },
    },
    defaultVariants: {
      variant: "neutral",
      dot: false,
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current shrink-0" />}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }