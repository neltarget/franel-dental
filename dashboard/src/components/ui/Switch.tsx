import * as React from "react"
import { cn } from "@/lib/utils"

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, label, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-[var(--shadow-ring)] disabled:cursor-not-allowed disabled:opacity-40",
          checked ? "bg-primary" : "bg-border-strong",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-1"
          )}
        />
      </button>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }