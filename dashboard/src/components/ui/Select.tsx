import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <span className={cn("relative inline-flex", className)}>
      <select
        className="h-9 w-full appearance-none rounded-control border border-border-strong bg-card pl-3 pr-8 text-xs font-medium text-foreground hover:bg-surface-2 focus:outline-none focus:border-primary focus:ring-[var(--shadow-ring)] cursor-pointer min-w-0"
        ref={ref}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-2"
      />
    </span>
  )
)
Select.displayName = "Select"

export { Select }